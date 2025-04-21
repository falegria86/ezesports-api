import { Router } from "express";
import { PlayersController } from "./controllers/playersController";

export class AppRoutes {
    static get routes(): Router {
        const router = Router();
        const playersController = new PlayersController();

        router.get('/api/current_match', playersController.getCurrentMatch);
        router.get('/api', playersController.getCurrentMatch);
        router.get('/api/players', playersController.getAllPlayers);

        router.put('/api/current_match/scores', playersController.updateCurrentMatchScores as any);
        router.post('/api/current_match', playersController.createCurrentMatch as any);

        return router;
    }
}