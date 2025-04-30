import { Pool } from "pg";
import { envs } from "../config/envs";
import { type Request, type Response } from "express";

export class CountriesController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        });
    }

    /**
     * Obtiene todos los países
     */
    getAllCountries = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query(`
                SELECT
                    country_id,
                    name,
                    code,
                    flag_url
                FROM
                    countries
                ORDER BY
                    name
            `);

            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Error fetching countries:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Obtiene un país por su ID
     */
    getCountryById = async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
            const result = await this.pool.query(`
                SELECT
                    country_id,
                    name,
                    code,
                    flag_url
                FROM
                    countries
                WHERE
                    country_id = $1
            `, [id]);

            if (result.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'País no encontrado'
                });
                return;
            }

            res.status(200).json(result.rows[0]);
        } catch (error) {
            console.error('Error fetching country:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    };

    /**
     * Crea un nuevo país
     */
    createCountry = async (req: Request, res: Response) => {
        const { name, code, flag_url } = req.body;

        // Validación básica
        if (!name || !code) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre y código del país son obligatorios'
            });
            return;
        }

        // Validar que el código sea de 2 caracteres
        if (code.length !== 2) {
            res.status(400).json({
                ok: false,
                msg: 'El código del país debe ser de 2 caracteres'
            });
            return;
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si ya existe un país con ese código
            const existingCountry = await client.query('SELECT 1 FROM countries WHERE code = $1', [code]);

            if (existingCountry.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'Ya existe un país con ese código'
                });
                await client.query('ROLLBACK');
                return;
            }

            const result = await client.query(`
                INSERT INTO countries (
                    name,
                    code,
                    flag_url
                ) VALUES ($1, $2, $3)
                RETURNING *
            `, [name, code.toUpperCase(), flag_url]);

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                country: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating country:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al crear el país'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Actualiza un país existente
     */
    updateCountry = async (req: Request, res: Response) => {
        const { id } = req.params;
        const { name, code, flag_url } = req.body;

        // Validación básica
        if (!name || !code) {
            res.status(400).json({
                ok: false,
                msg: 'El nombre y código del país son obligatorios'
            });
            return;
        }

        // Validar que el código sea de 2 caracteres
        if (code.length !== 2) {
            res.status(400).json({
                ok: false,
                msg: 'El código del país debe ser de 2 caracteres'
            });
            return;
        }

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el país existe
            const checkResult = await client.query('SELECT 1 FROM countries WHERE country_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'País no encontrado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si ya existe otro país con ese código
            const existingCountry = await client.query(
                'SELECT 1 FROM countries WHERE code = $1 AND country_id != $2',
                [code, id]
            );

            if (existingCountry.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'Ya existe otro país con ese código'
                });
                await client.query('ROLLBACK');
                return;
            }

            const result = await client.query(`
                UPDATE countries
                SET
                    name = $1,
                    code = $2,
                    flag_url = $3
                WHERE
                    country_id = $4
                RETURNING *
            `, [name, code.toUpperCase(), flag_url, id]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                country: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error updating country:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al actualizar el país'
            });
        } finally {
            client.release();
        }
    };

    /**
     * Elimina un país
     */
    deleteCountry = async (req: Request, res: Response) => {
        const { id } = req.params;
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Verificar si el país existe
            const checkResult = await client.query('SELECT 1 FROM countries WHERE country_id = $1', [id]);

            if (checkResult.rows.length === 0) {
                res.status(404).json({
                    ok: false,
                    msg: 'País no encontrado'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Verificar si el país está siendo usado por jugadores
            const playersUsingCountry = await client.query('SELECT 1 FROM players WHERE country_id = $1 LIMIT 1', [id]);

            if (playersUsingCountry.rows.length > 0) {
                res.status(400).json({
                    ok: false,
                    msg: 'No se puede eliminar el país porque está siendo usado por jugadores'
                });
                await client.query('ROLLBACK');
                return;
            }

            // Eliminar el país
            await client.query('DELETE FROM countries WHERE country_id = $1', [id]);

            await client.query('COMMIT');

            res.status(200).json({
                ok: true,
                msg: 'País eliminado correctamente'
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error deleting country:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error al eliminar el país'
            });
        } finally {
            client.release();
        }
    };
}