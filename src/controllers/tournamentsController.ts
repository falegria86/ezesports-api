import { Pool } from "pg";
import { envs } from "../config/envs";
import { type Request, type Response } from "express";

export class TournamentsController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
    }

    /**
     * Obtiene todos los torneos
     */
    getAllTournaments = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    tournament_id,
                    name,
                    start_date,
                    end_date,
                    location,
                    description,
                    logo_url,
                    banner_url,
                    prize_pool,
                    status
                FROM
                    tournaments
                ORDER BY
                    start_date DESC
            `);

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching tournaments:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Obtiene un torneo por su ID
     */
    getTournamentById = async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
            // Obtener información del torneo
            const tournamentResult = await this.pool.query(`
                SELECT
                    tournament_id,
                    name,
                    start_date,
                    end_date,
                    location,
                    description,
                    logo_url,
                    banner_url,
                    prize_pool,
                    status
                FROM
                    tournaments
                WHERE
                    tournament_id = $1
            `, [id]);

            if (tournamentResult.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Torneo no encontrado'
                });
            }

            const tournament = tournamentResult.rows[0];

            // Obtener juegos relacionados con el torneo
            const gamesResult = await this.pool.query(`
                SELECT
                    g.game_id,
                    g.name,
                    g.publisher,
                    g.logo_url
                FROM
                    games g
                JOIN
                    tournament_games tg ON g.game_id = tg.game_id
                WHERE
                    tg.tournament_id = $1
                ORDER BY
                    g.name
            `, [id]);

            tournament.games = gamesResult.rows;

            // Obtener fases del torneo
            const stagesResult = await this.pool.query(`
                SELECT
                    stage_id,
                    name,
                    start_date,
                    end_date,
                    stage_order,
                    stage_type,
                    best_of
                FROM
                    tournament_stages
                WHERE
                    tournament_id = $1
                ORDER BY
                    stage_order
            `, [id]);

            tournament.stages = stagesResult.rows;

            res.status(200).json(tournament);
        } catch (error) {
            console.error('Error fetching tournament:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Crea un nuevo torneo
     */
    createTournament = async (req: Request, res: Response) => {
        const {
            name,
            start_date,
            end_date,
            location,
            description,
            logo_url,
            banner_url,
            prize_pool,
            status,
            games
        } = req.body;

        // Validación básica
        if (!name) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre del torneo es obligatorio'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Insertar torneo
            const tournamentResult = await client.query(`
                INSERT INTO tournaments (
                    name,
                    start_date,
                    end_date,
                    location,
                    description,
                    logo_url,
                    banner_url,
                    prize_pool,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [name, start_date, end_date, location, description, logo_url, banner_url, prize_pool, status || 'upcoming']);

            const tournament = tournamentResult.rows[0];

            // Agregar juegos al torneo si se proporcionaron
            if (games && Array.isArray(games) && games.length > 0) {
                for (const gameId of games) {
                    // Verificar si el juego existe
                    const gameExists = await client.query('SELECT 1 FROM games WHERE game_id = $1', [gameId]);

                    if (gameExists.rows.length > 0) {
                        await client.query(`
                            INSERT INTO tournament_games (tournament_id, game_id)
                            VALUES ($1, $2)
                        `, [tournament.tournament_id, gameId]);
                    }
                }
            }

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                tournament
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating tournament:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al crear el torneo'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Actualiza un torneo existente
     */
    updateTournament = async (req: Request, res: Response) => {
        const { id } = req.params;
        const {
            name,
            start_date,
            end_date,
            location,
            description,
            logo_url,
            banner_url,
            prize_pool,
            status
        } = req.body;

        // Validación básica
        if (!name) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre del torneo es obligatorio'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el torneo existe
            const checkResult = await client.query('SELECT 1 FROM tournaments WHERE tournament_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Torneo no encontrado'
                });
            }

            // Actualizar torneo
            const result = await client.query(`
                UPDATE tournaments
                SET
                    name = $1,
                    start_date = $2,
                    end_date = $3,
                    location = $4,
                    description = $5,
                    logo_url = $6,
                    banner_url = $7,
                    prize_pool = $8,
                    status = $9
                WHERE
                    tournament_id = $10
                RETURNING *
            `, [name, start_date, end_date, location, description, logo_url, banner_url, prize_pool, status, id]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                tournament: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating tournament:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al actualizar el torneo'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina un torneo
     */
    deleteTournament = async (req: Request, res: Response) => {
        const { id } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el torneo existe
            const checkResult = await client.query('SELECT 1 FROM tournaments WHERE tournament_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Torneo no encontrado'
                });
            }

            // Eliminar las relaciones en tournament_games
            await client.query('DELETE FROM tournament_games WHERE tournament_id = $1', [id]);

            // Eliminar las fases del torneo
            await client.query('DELETE FROM tournament_stages WHERE tournament_id = $1', [id]);

            // Eliminar el torneo
            await client.query('DELETE FROM tournaments WHERE tournament_id = $1', [id]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Torneo eliminado correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting tournament:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar el torneo',
                error: error
            });
        } finally {
            client.release();
        }
    };

    /**
     * Agrega un juego a un torneo
     */
    addGameToTournament = async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { gameId } = req.body;

        // Validación básica
        if (!gameId) {
            res.status(400).json({
                ok: false,
                msg: 'El ID del juego es obligatorio'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el torneo existe
            const tournamentExists = await client.query('SELECT 1 FROM tournaments WHERE tournament_id = $1', [tournamentId]);

            if (tournamentExists.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Torneo no encontrado'
                });
            }

            // Verificar si el juego existe
            const gameExists = await client.query('SELECT 1 FROM games WHERE game_id = $1', [gameId]);

            if (gameExists.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Juego no encontrado'
                });
            }

            // Verificar si la relación ya existe
            const relationExists = await client.query(
                'SELECT 1 FROM tournament_games WHERE tournament_id = $1 AND game_id = $2',
                [tournamentId, gameId]
            );

            if (relationExists.rows.length > 0) {
                await client.query('ROLLBACK');
                res.status(400).json({
                    ok: false,
                    msg: 'El juego ya está asociado a este torneo'
                });
            }

            // Agregar el juego al torneo
            await client.query(`
                INSERT INTO tournament_games (tournament_id, game_id)
                VALUES ($1, $2)
            `, [tournamentId, gameId]);

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                msg: 'Juego agregado al torneo correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error adding game to tournament:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al agregar el juego al torneo'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina un juego de un torneo
     */
    removeGameFromTournament = async (req: Request, res: Response) => {
        const { tournamentId, gameId } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si la relación existe
            const relationExists = await client.query(
                'SELECT 1 FROM tournament_games WHERE tournament_id = $1 AND game_id = $2',
                [tournamentId, gameId]
            );

            if (relationExists.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'El juego no está asociado a este torneo'
                });
            }

            // Eliminar la relación
            await client.query(
                'DELETE FROM tournament_games WHERE tournament_id = $1 AND game_id = $2',
                [tournamentId, gameId]
            );

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Juego eliminado del torneo correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error removing game from tournament:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar el juego del torneo'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Agrega una fase a un torneo
     */
    addTournamentStage = async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const {
            name,
            start_date,
            end_date,
            stage_order,
            stage_type,
            best_of
        } = req.body;

        // Validación básica
        if (!name || !stage_type) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre y tipo de fase son obligatorios'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el torneo existe
            const tournamentExists = await client.query('SELECT 1 FROM tournaments WHERE tournament_id = $1', [tournamentId]);

            if (tournamentExists.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Torneo no encontrado'
                });
            }

            // Insertar fase del torneo
            const result = await client.query(`
                INSERT INTO tournament_stages (
                    tournament_id,
                    name,
                    start_date,
                    end_date,
                    stage_order,
                    stage_type,
                    best_of
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [tournamentId, name, start_date, end_date, stage_order, stage_type, best_of || 3]);

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                stage: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating tournament stage:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al crear la fase del torneo'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Actualiza una fase de torneo
     */
    updateTournamentStage = async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const {
            name,
            start_date,
            end_date,
            stage_order,
            stage_type,
            best_of
        } = req.body;

        // Validación básica
        if (!name || !stage_type) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre y tipo de fase son obligatorios'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si la fase existe
            const stageExists = await client.query('SELECT 1 FROM tournament_stages WHERE stage_id = $1', [stageId]);

            if (stageExists.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Fase de torneo no encontrada'
                });
            }

            // Actualizar fase
            const result = await client.query(`
                UPDATE tournament_stages
                SET
                    name = $1,
                    start_date = $2,
                    end_date = $3,
                    stage_order = $4,
                    stage_type = $5,
                    best_of = $6
                WHERE
                    stage_id = $7
                RETURNING *
            `, [name, start_date, end_date, stage_order, stage_type, best_of, stageId]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                stage: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating tournament stage:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al actualizar la fase del torneo'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina una fase de torneo
     */
    deleteTournamentStage = async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si la fase existe
            const stageExists = await client.query('SELECT 1 FROM tournament_stages WHERE stage_id = $1', [stageId]);

            if (stageExists.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Fase de torneo no encontrada'
                });
            }

            // Verificar si hay grupos en esta fase y eliminarlos
            await client.query('DELETE FROM groups WHERE stage_id = $1', [stageId]);

            // Verificar si hay rondas de bracket en esta fase y eliminarlas
            await client.query('DELETE FROM bracket_rounds WHERE stage_id = $1', [stageId]);

            // Eliminar la fase
            await client.query('DELETE FROM tournament_stages WHERE stage_id = $1', [stageId]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Fase de torneo eliminada correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting tournament stage:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar la fase del torneo',
                error: error
            });
        } finally {
            client.release();
        }
    }
}