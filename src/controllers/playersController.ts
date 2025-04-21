import { Pool } from "pg";
import { envs } from "../config/envs";
import { type Request, type Response } from "express";

export class PlayersController {
    private pool: Pool;
    private localApiUrl: string;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
        this.localApiUrl = "http://localhost:3001";
    }

    getCurrentMatch = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    cm.match_id,
                    cm.player1_score,
                    cm.player2_score,
                    cm.match_title,
                    cm.game_id,
                    p1.nickname AS player1_name,
                    p2.nickname AS player2_name,
                    c1.flag_url AS player1_flag,
                    c2.flag_url AS player2_flag
                FROM
                    current_match cm
                JOIN
                    players p1 ON cm.player1_id = p1.player_id
                JOIN
                    players p2 ON cm.player2_id = p2.player_id
                JOIN
                    countries c1 ON p1.country_id = c1.country_id
                JOIN
                    countries c2 ON p2.country_id = c2.country_id
                ORDER BY
                    cm.match_id DESC
                LIMIT 1
            `);

            const match = result.rows[0];
            res.status(200).json(match);
        } catch (error) {
            console.error('Error fetching current match:', error);
            res.status(500).json({ message: 'Error obteniendo información del match' });
        }
    }

    getAllPlayers = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    p.player_id,
                    p.nickname,
                    p.full_name,
                    p.team,
                    p.avatar_url,
                    c.name AS country_name,
                    c.code AS country_code
                FROM
                    players p
                JOIN
                    countries c ON p.country_id = c.country_id
                ORDER BY
                    p.full_name
            `);
            const players = result.rows;

            res.status(200).json(players);
        } catch (error) {
            console.error('Error fetching players:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    }

    updateCurrentMatchScores = async (req: Request, res: Response) => {
        try {
            const { player1_score, player2_score } = req.body;

            if (player1_score === undefined && player2_score === undefined) {
                return res.status(400).json({ message: 'Se requiere al menos un score para actualizar' });
            }

            let updateQuery = 'UPDATE current_match SET ';
            const updateValues = [];
            const queryParams = [];

            if (player1_score !== undefined) {
                updateValues.push(`player1_score = $${updateValues.length + 1}`);
                queryParams.push(player1_score);
            }

            if (player2_score !== undefined) {
                updateValues.push(`player2_score = $${updateValues.length + 1}`);
                queryParams.push(player2_score);
            }

            updateValues.push(`updated_at = $${updateValues.length + 1}`);
            queryParams.push(new Date());

            updateQuery += updateValues.join(', ');
            updateQuery += ' WHERE match_id = (SELECT match_id FROM current_match ORDER BY match_id DESC LIMIT 1) RETURNING *';

            const result = await this.pool.query(updateQuery, queryParams);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'No se encontró un partido actual' });
            }

            const updatedMatch = result.rows[0];

            try {
                if (player1_score !== undefined || player2_score !== undefined) {
                    const vMixUpdateResponse = await fetch(`${this.localApiUrl}/player-scores`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            player1_score: player1_score,
                            player2_score: player2_score,
                            match_id: updatedMatch.match_id
                        })
                    });

                    if (!vMixUpdateResponse.ok) {
                        console.log('No se pudo actualizar vMix, pero los datos se guardaron en la base de datos');
                    }
                }
            } catch (vMixError) {
                console.error('Error al comunicarse con vMix:', vMixError);
            }

            res.status(200).json({
                message: 'Scores actualizados correctamente',
                match: updatedMatch
            });
        } catch (error) {
            console.error('Error updating match scores:', error);
            res.status(500).json({ message: 'Error actualizando los scores del partido' });
        }
    }

    createCurrentMatch = async (req: Request, res: Response) => {
        try {
            const {
                player1_id,
                player2_id,
                player1_score,
                player2_score,
                game_id,
                tournament_id,
                match_title,
                round
            } = req.body;

            if (!player1_id || !player2_id) {
                return res.status(400).json({ message: 'Se requiere ID de ambos jugadores' });
            }

            const result = await this.pool.query(`
                INSERT INTO current_match
                (player1_id, player2_id, player1_score, player2_score, game_id, tournament_id, match_title, round, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                player1_id,
                player2_id,
                player1_score || 0,
                player2_score || 0,
                game_id,
                tournament_id,
                match_title,
                round,
                new Date()
            ]);

            const newMatch = result.rows[0];

            const fullMatchResult = await this.pool.query(`
                SELECT
                    cm.match_id,
                    cm.player1_score,
                    cm.player2_score,
                    cm.match_title,
                    p1.nickname AS player1_name,
                    p2.nickname AS player2_name,
                    c1.flag_url AS player1_flag,
                    c2.flag_url AS player2_flag
                FROM
                    current_match cm
                JOIN
                    players p1 ON cm.player1_id = p1.player_id
                JOIN
                    players p2 ON cm.player2_id = p2.player_id
                JOIN
                    countries c1 ON p1.country_id = c1.country_id
                JOIN
                    countries c2 ON p2.country_id = c2.country_id
                WHERE
                    cm.match_id = $1
            `, [newMatch.match_id]);

            const fullMatch = fullMatchResult.rows[0];

            try {
                await fetch(`${this.localApiUrl}/match-title`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        match_title: fullMatch.match_title,
                        game_name: fullMatch.game_name,
                        player1_name: fullMatch.player1_name,
                        player2_name: fullMatch.player2_name
                    })
                });

                await fetch(`${this.localApiUrl}/player-scores`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        player1_score: fullMatch.player1_score,
                        player2_score: fullMatch.player2_score,
                        match_id: fullMatch.match_id
                    })
                });
            } catch (vMixError) {
                console.error('Error al comunicarse con vMix:', vMixError);
            }

            res.status(201).json({
                message: 'Partido creado correctamente',
                match: fullMatch
            });
        } catch (error) {
            console.error('Error creating match:', error);
            res.status(500).json({ message: 'Error creando el partido' });
        }
    }
}