import { Pool } from "pg";
import { envs } from "../config/envs";
import { type Request, type Response } from "express";

export class GamesController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
    }

    /**
     * Obtiene todos los juegos
     */
    getAllGames = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    game_id,
                    name,
                    publisher,
                    release_date,
                    logo_url,
                    banner_url,
                    description
                FROM
                    games
                ORDER BY
                    name
            `);

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching games:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Obtiene un juego por su ID
     */
    getGameById = async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
            // Obtener información del juego
            const gameResult = await this.pool.query(`
                SELECT
                    game_id,
                    name,
                    publisher,
                    release_date,
                    logo_url,
                    banner_url,
                    description
                FROM
                    games
                WHERE
                    game_id = $1
            `, [id]);

            if (gameResult.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Juego no encontrado'
                });
            }

            const game = gameResult.rows[0];

            // Obtener personajes del juego
            const charactersResult = await this.pool.query(`
                SELECT
                    character_id,
                    name,
                    image_url,
                    description,
                    is_kameo
                FROM
                    characters
                WHERE
                    game_id = $1
                ORDER BY
                    name
            `, [id]);

            game.characters = charactersResult.rows;

            res.status(200).json(game);
        } catch (error) {
            console.error('Error fetching game:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Crea un nuevo juego
     */
    createGame = async (req: Request, res: Response) => {
        const { name, publisher, release_date, logo_url, banner_url, description } = req.body;

        // Validación básica
        if (!name) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre del juego es obligatorio'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const result = await client.query(`
                INSERT INTO games (
                    name,
                    publisher,
                    release_date,
                    logo_url,
                    banner_url,
                    description
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [name, publisher, release_date, logo_url, banner_url, description]);

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                game: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating game:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al crear el juego'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Actualiza un juego existente
     */
    updateGame = async (req: Request, res: Response) => {
        const { id } = req.params;
        const { name, publisher, release_date, logo_url, banner_url, description } = req.body;

        // Validación básica
        if (!name) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre del juego es obligatorio'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el juego existe
            const checkResult = await client.query('SELECT 1 FROM games WHERE game_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Juego no encontrado'
                });
            }

            const result = await client.query(`
                UPDATE games
                SET
                    name = $1,
                    publisher = $2,
                    release_date = $3,
                    logo_url = $4,
                    banner_url = $5,
                    description = $6
                WHERE
                    game_id = $7
                RETURNING *
            `, [name, publisher, release_date, logo_url, banner_url, description, id]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                game: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating game:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al actualizar el juego'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina un juego
     */
    deleteGame = async (req: Request, res: Response) => {
        const { id } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el juego existe
            const checkResult = await client.query('SELECT 1 FROM games WHERE game_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Juego no encontrado'
                });
            }

            // Eliminar personajes relacionados primero
            await client.query('DELETE FROM characters WHERE game_id = $1', [id]);

            // Eliminar el juego
            await client.query('DELETE FROM games WHERE game_id = $1', [id]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Juego eliminado correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting game:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar el juego',
                error: error
            });
        } finally {
            client.release();
        }
    };

    /**
     * Agrega un personaje a un juego
     */
    addCharacter = async (req: Request, res: Response) => {
        const { gameId } = req.params;
        const { name, image_url, description, is_kameo } = req.body;

        // Validación básica
        if (!name) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre del personaje es obligatorio'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el juego existe
            const checkResult = await client.query('SELECT 1 FROM games WHERE game_id = $1', [gameId]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Juego no encontrado'
                });
            }

            const result = await client.query(`
                INSERT INTO characters (
                    game_id,
                    name,
                    image_url,
                    description,
                    is_kameo
                ) VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [gameId, name, image_url, description, is_kameo || false]);

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                character: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating character:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al crear el personaje'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Actualiza un personaje
     */
    updateCharacter = async (req: Request, res: Response) => {
        const { characterId } = req.params;
        const { name, image_url, description, is_kameo } = req.body;

        // Validación básica
        if (!name) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre del personaje es obligatorio'
            });
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el personaje existe
            const checkResult = await client.query('SELECT 1 FROM characters WHERE character_id = $1', [characterId]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Personaje no encontrado'
                });
            }

            const result = await client.query(`
                UPDATE characters
                SET
                    name = $1,
                    image_url = $2,
                    description = $3,
                    is_kameo = $4
                WHERE
                    character_id = $5
                RETURNING *
            `, [name, image_url, description, is_kameo || false, characterId]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                character: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating character:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al actualizar el personaje'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina un personaje
     */
    deleteCharacter = async (req: Request, res: Response) => {
        const { characterId } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el personaje existe
            const checkResult = await client.query('SELECT 1 FROM characters WHERE character_id = $1', [characterId]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({
                    ok: false,
                    msg: 'Personaje no encontrado'
                });
            }

            // Eliminar el personaje
            await client.query('DELETE FROM characters WHERE character_id = $1', [characterId]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Personaje eliminado correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting character:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar el personaje',
                error: error
            });
        } finally {
            client.release();
        }
    };
}