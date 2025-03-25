import { Router } from "express";
import { PlayersController } from "./controllers/playersController";

export class AppRoutes {
    static get routes(): Router {
        const router = Router();
        const playersController = new PlayersController();

        router.get('/api', playersController.getPlayers);
        return router;
    }
}