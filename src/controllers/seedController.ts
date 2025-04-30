import { Pool } from "pg";
import { envs } from "../config/envs";
import { type Request, type Response } from "express";

export class SeedController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
    }

    resetDatabase = async (req: Request, res: Response) => {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Desactivar verificación de claves foráneas temporalmente
            await client.query('SET CONSTRAINTS ALL DEFERRED');

            // Limpiar todas las tablas en orden inverso a su creación para evitar problemas de claves foráneas
            await client.query('TRUNCATE TABLE tournament_results CASCADE');
            await client.query('TRUNCATE TABLE match_history CASCADE');
            await client.query('TRUNCATE TABLE current_match CASCADE');
            await client.query('TRUNCATE TABLE player_games CASCADE');
            await client.query('TRUNCATE TABLE group_match_sets CASCADE');
            await client.query('TRUNCATE TABLE group_matches CASCADE');
            await client.query('TRUNCATE TABLE match_sets CASCADE');
            await client.query('TRUNCATE TABLE bracket_matches CASCADE');
            await client.query('TRUNCATE TABLE bracket_rounds CASCADE');
            await client.query('TRUNCATE TABLE group_players CASCADE');
            await client.query('TRUNCATE TABLE groups CASCADE');
            await client.query('TRUNCATE TABLE tournament_stages CASCADE');
            await client.query('TRUNCATE TABLE players CASCADE');
            await client.query('TRUNCATE TABLE tournament_games CASCADE');
            await client.query('TRUNCATE TABLE characters CASCADE');
            await client.query('TRUNCATE TABLE tournaments CASCADE');
            await client.query('TRUNCATE TABLE games CASCADE');
            await client.query('TRUNCATE TABLE countries CASCADE');

            // Resetear las secuencias
            await client.query("SELECT setval('countries_country_id_seq', 1, false)");
            await client.query("SELECT setval('players_player_id_seq', 1, false)");
            await client.query("SELECT setval('current_match_match_id_seq', 1, false)");

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'Base de datos limpiada exitosamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error reseteando la base de datos:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al limpiar la base de datos',
                error
            });
        } finally {
            client.release();
        }
    }
}