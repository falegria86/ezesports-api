import { Pool } from "pg";
import { envs } from "../config/envs";
import type { Request, Response } from "express";

export class PlayersController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
    }

    getCurrentMatch = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    cm.match_id,
                    cm.player1_score,
                    cm.player2_score,
                    cm.match_title,
                    cm.game_name,
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

            const players = result.rows;
            res.status(200).json(players);
        } catch (error) {
            console.error('Error fetching current match:', error);
            res.status(500).json({ message: 'Error obteniendo información del match' });
        }
    }

    public getAllPlayers = async (req: Request, res: Response) => {
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
}