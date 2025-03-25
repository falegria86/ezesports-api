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
        res.status(200).json({ msg: 'Test' })
    }
}