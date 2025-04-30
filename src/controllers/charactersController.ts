import { Pool } from "pg";
import { envs } from "../config/envs";
import { type Request, type Response } from "express";

export class CharactersController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
    }

    /**
     * Obtiene todos los personajes
     */
    getAllCharacters = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    c.character_id,
                    c.name,
                    c.image_url,
                    c.description,
                    c.is_kameo,
                    g.game_id,
                    g.name AS game_name
                FROM
                    characters c
                JOIN
                    games g ON c.game_id = g.game_id
                ORDER BY
                    g.name, c.name
            `);

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching characters:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Obtiene personajes por juego
     */
    getCharactersByGame = async (req: Request, res: Response) => {
        const { gameId } = req.params;

        try {
            // Verificar si el juego existe
            const gameExists = await this.pool.query('SELECT 1 FROM games WHERE game_id = $1', [gameId]);

            if (gameExists.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Juego no encontrado'
                });
                return;
            }

            const result = await this.pool.query(`
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
            `, [gameId]);

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching characters by game:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Obtiene un personaje por su ID
     */
    getCharacterById = async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
            const result = await this.pool.query(`
                SELECT
                    c.character_id,
                    c.name,
                    c.image_url,
                    c.description,
                    c.is_kameo,
                    g.game_id,
                    g.name AS game_name
                FROM
                    characters c
                JOIN
                    games g ON c.game_id = g.game_id
                WHERE
                    c.character_id = $1
            `, [id]);

            if (result.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Personaje no encontrado'
                });
                return;
            }

            // Obtener jugadores que usan este personaje como principal
            const mainPlayersResult = await this.pool.query(`
                SELECT
                    p.player_id,
                    p.nickname,
                    p.avatar_url
                FROM
                    player_games pg
                JOIN
                    players p ON pg.player_id = p.player_id
                WHERE
                    pg.main_character_id = $1
                ORDER BY
                    p.nickname
            `, [id]);

            // Obtener jugadores que usan este personaje como secundario
            const secondaryPlayersResult = await this.pool.query(`
                SELECT
                    p.player_id,
                    p.nickname,
                    p.avatar_url
                FROM
                    player_games pg
                JOIN
                    players p ON pg.player_id = p.player_id
                WHERE
                    pg.secondary_character_id = $1
                ORDER BY
                    p.nickname
            `, [id]);

            const character = result.rows[0];
            character.main_players = mainPlayersResult.rows;
            character.secondary_players = secondaryPlayersResult.rows;

            res.status(200).json(character);
        } catch (error) {
            console.error('Error fetching character:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Crea un nuevo personaje
     */
    createCharacter = async (req: Request, res: Response) => {
        const { game_id, name, image_url, description, is_kameo } = req.body;

        // Validación básica
        if (!game_id || !name) {
            res.status(400).json({
                ok: false,
                msg: 'El ID del juego y el nombre del personaje son obligatorios'
            });
            return;
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

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

            // Verificar si ya existe un personaje con ese nombre en el mismo juego
            const existingCharacter = await client.query(
                'SELECT 1 FROM characters WHERE name = $1 AND game_id = $2',
                [name, game_id]
            );

            if (existingCharacter.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'Ya existe un personaje con ese nombre en este juego'
                });
                await client.query('ROLLBACK');
                return;
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
            `, [game_id, name, image_url, description, is_kameo || false]);

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
     * Actualiza un personaje existente
     */
    updateCharacter = async (req: Request, res: Response) => {
        const { id } = req.params;
        const { game_id, name, image_url, description, is_kameo } = req.body;

        // Validación básica
        if (!game_id || !name) {
            res.status(400).json({
                ok: false,
                msg: 'El ID del juego y el nombre del personaje son obligatorios'
            });
            return;
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el personaje existe
            const characterExists = await client.query('SELECT 1 FROM characters WHERE character_id = $1', [id]);

            if (characterExists.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Personaje no encontrado'
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

            // Verificar si ya existe otro personaje con ese nombre en el mismo juego
            const existingCharacter = await client.query(
                'SELECT 1 FROM characters WHERE name = $1 AND game_id = $2 AND character_id != $3',
                [name, game_id, id]
            );

            if (existingCharacter.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'Ya existe otro personaje con ese nombre en este juego'
                });
                await client.query('ROLLBACK');
                return;
            }

            const result = await client.query(`
                UPDATE characters
                SET
                    game_id = $1,
                    name = $2,
                    image_url = $3,
                    description = $4,
                    is_kameo = $5
                WHERE
                    character_id = $6
                RETURNING *
            `, [game_id, name, image_url, description, is_kameo || false, id]);

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
        const { id } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el personaje existe
            const characterExists = await client.query('SELECT 1 FROM characters WHERE character_id = $1', [id]);

            if (characterExists.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'Personaje no encontrado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si el personaje está siendo usado por jugadores como personaje principal
            const usedAsMainCharacter = await client.query(
                'SELECT 1 FROM player_games WHERE main_character_id = $1 LIMIT 1',
                [id]
            );

            // Verificar si el personaje está siendo usado por jugadores como personaje secundario
            const usedAsSecondaryCharacter = await client.query(
                'SELECT 1 FROM player_games WHERE secondary_character_id = $1 LIMIT 1',
                [id]
            );

            if (usedAsMainCharacter.rows.length > 0 || usedAsSecondaryCharacter.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'No se puede eliminar el personaje porque está siendo usado por jugadores'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Eliminar el personaje
            await client.query('DELETE FROM characters WHERE character_id = $1', [id]);

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
                msg: 'Error al eliminar el personaje'
            });
        } finally {
            client.release();
        }
    };
}