import type { Request, Response } from "express";
import { Pool } from "pg";
import { envs } from "../config/envs";

export class PlayersController {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            connectionString: envs.HOST
        })
    }

    public getPlayers = async (req: Request, res: Response) => {
        try {
            const result = await this.pool.query('SELECT * FROM player');
            res.status(200).json({
                ok: true,
                players: result.rows
            });
        } catch (error) {
            console.error('Error fetching players:', error);
            res.status(500).json({
                ok: false,
                msg: 'Error interno del servidor'
            });
        }
    }
}