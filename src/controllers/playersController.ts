import { Pool } from "pg";
import { envs } from "../config/envs";
import { type Request, type Response } from "express";

export class PlayersController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
    }

    /**
     * Obtiene todos los jugadores
     */
    getAllPlayers = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    p.player_id,
                    p.nickname,
                    p.full_name,
                    p.team,
                    p.avatar_url,
                    p.position,
                    p.last_result,
                    c.name AS country_name,
                    c.code AS country_code,
                    c.country_id
                FROM
                    players p
                LEFT JOIN
                    countries c ON p.country_id = c.country_id
                ORDER BY
                    p.nickname
            `);

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching players:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Obtiene un jugador por su ID
     */
    getPlayerById = async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
            // Obtener información del jugador
            const playerResult = await this.pool.query(`
                SELECT
                    p.player_id,
                    p.nickname,
                    p.full_name,
                    p.team,
                    p.avatar_url,
                    p.position,
                    p.last_result,
                    p.tournament1,
                    p.tournament2,
                    p.tournament3,
                    c.country_id,
                    c.name AS country_name,
                    c.code AS country_code
                FROM
                    players p
                LEFT JOIN
                    countries c ON p.country_id = c.country_id
                WHERE
                    p.player_id = $1
            `, [id]);

            if (playerResult.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Jugador no encontrado'
                });
                return;
            }

            const player = playerResult.rows[0];

            // Obtener juegos y personajes del jugador
            const playerGamesResult = await this.pool.query(`
                SELECT
                    pg.player_game_id,
                    g.game_id,
                    g.name AS game_name,
                    g.logo_url AS game_logo,
                    pg.rank,
                    pg.skill_rating,
                    c1.character_id AS main_character_id,
                    c1.name AS main_character_name,
                    c1.image_url AS main_character_image,
                    c2.character_id AS secondary_character_id,
                    c2.name AS secondary_character_name,
                    c2.image_url AS secondary_character_image
                FROM
                    player_games pg
                JOIN
                    games g ON pg.game_id = g.game_id
                LEFT JOIN
                    characters c1 ON pg.main_character_id = c1.character_id
                LEFT JOIN
                    characters c2 ON pg.secondary_character_id = c2.character_id
                WHERE
                    pg.player_id = $1
            `, [id]);

            player.games = playerGamesResult.rows;

            // Obtener resultados recientes del jugador
            const recentMatchesResult = await this.pool.query(`
                SELECT
                    mh.match_id,
                    mh.match_date,
                    g.name AS game_name,
                    t.name AS tournament_name,
                    CASE
                        WHEN mh.player1_id = $1 THEN p2.nickname
                        ELSE p1.nickname
                    END AS opponent_nickname,
                    CASE
                        WHEN mh.player1_id = $1 THEN mh.player1_score
                        ELSE mh.player2_score
                    END AS player_score,
                    CASE
                        WHEN mh.player1_id = $1 THEN mh.player2_score
                        ELSE mh.player1_score
                    END AS opponent_score,
                    CASE
                        WHEN mh.winner_id = $1 THEN true
                        ELSE false
                    END AS is_winner
                FROM
                    match_history mh
                JOIN
                    games g ON mh.game_id = g.game_id
                LEFT JOIN
                    tournaments t ON mh.tournament_id = t.tournament_id
                JOIN
                    players p1 ON mh.player1_id = p1.player_id
                JOIN
                    players p2 ON mh.player2_id = p2.player_id
                WHERE
                    mh.player1_id = $1 OR mh.player2_id = $1
                ORDER BY
                    mh.match_date DESC
                LIMIT 5
            `, [id]);

            player.recent_matches = recentMatchesResult.rows;

            res.status(200).json(player);
        } catch (error) {
            console.error('Error fetching player:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Crea un nuevo jugador
     */
    createPlayer = async (req: Request, res: Response) => {
        const {
            nickname,
            full_name,
            country_id,
            team,
            avatar_url,
            position,
            last_result,
            tournament1,
            tournament2,
            tournament3
        } = req.body;

        // Validación básica
        if (!nickname) {
            res.status(400).json({
                ok: false,
                msg: 'El nickname del jugador es obligatorio'
            });
            return;
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si ya existe un jugador con ese nickname
            const existingPlayer = await client.query('SELECT 1 FROM players WHERE nickname = $1', [nickname]);

            if (existingPlayer.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'Ya existe un jugador con ese nickname'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si el país existe (si se proporciona)
            if (country_id) {
                const countryExists = await client.query('SELECT 1 FROM countries WHERE country_id = $1', [country_id]);

                if (countryExists.rows.length === 0) {
                    res.status(400).json({
                        ok: false,
                        msg: 'El país especificado no existe'
                    });
                    await client.query('ROLLBACK');
                    return;
                }
            }

            const result = await client.query(`
                INSERT INTO players (
                    nickname,
                    full_name,
                    country_id,
                    team,
                    avatar_url,
                    position,
                    last_result,
                    tournament1,
                    tournament2,
                    tournament3
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
            `, [
                nickname,
                full_name,
                country_id,
                team,
                avatar_url,
                position,
                last_result,
                tournament1,
                tournament2,
                tournament3
            ]);

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                player: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating player:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al crear el jugador'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Actualiza un jugador existente
     */
    updatePlayer = async (req: Request, res: Response) => {
        const { id } = req.params;
        const {
            nickname,
            full_name,
            country_id,
            team,
            avatar_url,
            position,
            last_result,
            tournament1,
            tournament2,
            tournament3
        } = req.body;

        // Validación básica
        if (!nickname) {
            res.status(400).json({
                ok: false,
                msg: 'El nickname del jugador es obligatorio'
            });
            return;
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el jugador existe
            const checkResult = await client.query('SELECT 1 FROM players WHERE player_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Jugador no encontrado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si ya existe otro jugador con ese nickname
            const existingPlayer = await client.query(
                'SELECT 1 FROM players WHERE nickname = $1 AND player_id != $2',
                [nickname, id]
            );

            if (existingPlayer.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'Ya existe otro jugador con ese nickname'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si el país existe (si se proporciona)
            if (country_id) {
                const countryExists = await client.query('SELECT 1 FROM countries WHERE country_id = $1', [country_id]);

                if (countryExists.rows.length === 0) {
                    res.status(400).json({
                        ok: false,
                        msg: 'El país especificado no existe'
                    });
                    await client.query('ROLLBACK');
                    return;
                }
            }

            const result = await client.query(`
                UPDATE players
                SET
                    nickname = $1,
                    full_name = $2,
                    country_id = $3,
                    team = $4,
                    avatar_url = $5,
                    position = $6,
                    last_result = $7,
                    tournament1 = $8,
                    tournament2 = $9,
                    tournament3 = $10
                WHERE
                    player_id = $11
                RETURNING *
            `, [
                nickname,
                full_name,
                country_id,
                team,
                avatar_url,
                position,
                last_result,
                tournament1,
                tournament2,
                tournament3,
                id
            ]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                player: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating player:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al actualizar el jugador'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina un jugador
     */
    deletePlayer = async (req: Request, res: Response) => {
        const { id } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el jugador existe
            const checkResult = await client.query('SELECT 1 FROM players WHERE player_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Jugador no encontrado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Eliminar registros relacionados en player_games
            await client.query('DELETE FROM player_games WHERE player_id = $1', [id]);

            // Verificar si el jugador está en algún partido actual
            const currentMatchCheck = await client.query(
                'SELECT 1 FROM current_match WHERE player1_id = $1 OR player2_id = $1',
                [id]
            );

            if (currentMatchCheck.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'No se puede eliminar el jugador porque está en un partido actual'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Eliminar al jugador
            await client.query('DELETE FROM players WHERE player_id = $1', [id]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Jugador eliminado correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting player:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar el jugador'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Asigna un juego y personajes a un jugador
     */
    assignGameToPlayer = async (req: Request, res: Response) => {
        const { playerId } = req.params;
        const {
            game_id,
            main_character_id,
            secondary_character_id,
            rank,
            skill_rating
        } = req.body;

        // Validación básica
        if (!game_id) {
            res.status(400).json({
                ok: false,
                msg: 'El ID del juego es obligatorio'
            });
            return;
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el jugador existe
            const playerExists = await client.query('SELECT 1 FROM players WHERE player_id = $1', [playerId]);

            if (playerExists.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Jugador no encontrado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si el juego existe
            const gameExists = await client.query('SELECT 1 FROM games WHERE game_id = $1', [game_id]);

            if (gameExists.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Juego no encontrado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si el personaje principal existe (si se proporciona)
            if (main_character_id) {
                const mainCharacterExists = await client.query(
                    'SELECT 1 FROM characters WHERE character_id = $1 AND game_id = $2',
                    [main_character_id, game_id]
                );

                if (mainCharacterExists.rows.length === 0) {
                    res.status(400).json({
                        ok: false,
                        msg: 'El personaje principal no existe o no pertenece a este juego'
                    });
                    await client.query('ROLLBACK');
                    return;
                }
            }

            // Verificar si el personaje secundario existe (si se proporciona)
            if (secondary_character_id) {
                const secondaryCharacterExists = await client.query(
                    'SELECT 1 FROM characters WHERE character_id = $1 AND game_id = $2',
                    [secondary_character_id, game_id]
                );

                if (secondaryCharacterExists.rows.length === 0) {
                    res.status(400).json({
                        ok: false,
                        msg: 'El personaje secundario no existe o no pertenece a este juego'
                    });
                    await client.query('ROLLBACK');
                    return;
                }
            }

            // Verificar si ya existe esta relación
            const existingRelation = await client.query(
                'SELECT player_game_id FROM player_games WHERE player_id = $1 AND game_id = $2',
                [playerId, game_id]
            );

            let result;

            if (existingRelation.rows.length > 0) {
                // Actualizar la relación existente
                result = await client.query(`
                    UPDATE player_games
                    SET
                        main_character_id = $1,
                        secondary_character_id = $2,
                        rank = $3,
                        skill_rating = $4
                    WHERE
                        player_id = $5 AND game_id = $6
                    RETURNING *
                `, [main_character_id, secondary_character_id, rank, skill_rating, playerId, game_id]);
            } else {
                // Crear nueva relación
                result = await client.query(`
                    INSERT INTO player_games (
                        player_id,
                        game_id,
                        main_character_id,
                        secondary_character_id,
                        rank,
                        skill_rating
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `, [playerId, game_id, main_character_id, secondary_character_id, rank, skill_rating]);
            }

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                player_game: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error assigning game to player:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al asignar el juego al jugador'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina un juego asignado a un jugador
     */
    removeGameFromPlayer = async (req: Request, res: Response) => {
        const { playerId, gameId } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si la relación existe
            const relationExists = await client.query(
                'SELECT 1 FROM player_games WHERE player_id = $1 AND game_id = $2',
                [playerId, gameId]
            );

            if (relationExists.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'El jugador no tiene este juego asignado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Eliminar la relación
            await client.query(
                'DELETE FROM player_games WHERE player_id = $1 AND game_id = $2',
                [playerId, gameId]
            );

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Juego eliminado del jugador correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error removing game from player:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar el juego del jugador'
            });
        } finally {
            client.release();
        }
    };
}