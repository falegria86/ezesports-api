import { Router } from "express";
import { PlayersController } from "./controllers/playersController";
import { SeedController } from "./controllers/seedController";
import { GamesController } from "./controllers/gamesController";
import { TournamentsController } from "./controllers/tournamentsController";
import { CountriesController } from "./controllers/countriesController";
import { CharactersController } from "./controllers/charactersController";

export class AppRoutes {
    static get routes(): Router {
        const router = Router();

        const playersController = new PlayersController();
        const seedController = new SeedController();
        const gamesController = new GamesController();
        const tournamentsController = new TournamentsController();
        const countriesController = new CountriesController();
        const charactersController = new CharactersController();

        // Players Routes
        router.get('/api/players', playersController.getAllPlayers);
        router.get('/api/players/:id', playersController.getPlayerById);
        router.post('/api/players', playersController.createPlayer);
        router.put('/api/players/:id', playersController.updatePlayer);
        router.delete('/api/players/:id', playersController.deletePlayer);
        router.post('/api/players/:playerId/games', playersController.assignGameToPlayer);
        router.delete('/api/players/:playerId/games/:gameId', playersController.removeGameFromPlayer);

        // Countries Routes
        router.get('/api/countries', countriesController.getAllCountries);
        router.get('/api/countries/:id', countriesController.getCountryById);
        router.post('/api/countries', countriesController.createCountry);
        router.put('/api/countries/:id', countriesController.updateCountry);
        router.delete('/api/countries/:id', countriesController.deleteCountry);

        // Characters Routes
        router.get('/api/characters', charactersController.getAllCharacters);
        router.get('/api/characters/:id', charactersController.getCharacterById);
        router.get('/api/games/:gameId/characters', charactersController.getCharactersByGame);
        router.post('/api/characters', charactersController.createCharacter);
        router.put('/api/characters/:id', charactersController.updateCharacter);
        router.delete('/api/characters/:id', charactersController.deleteCharacter);

        // Games Routes
        router.get('/api/games', gamesController.getAllGames);
        router.get('/api/games/:id', gamesController.getGameById);
        router.post('/api/games', gamesController.createGame);
        router.put('/api/games/:id', gamesController.updateGame);
        router.delete('/api/games/:id', gamesController.deleteGame);

        // Character Routes (relacionados con Game - se mantienen para compatibilidad)
        router.post('/api/games/:gameId/characters', gamesController.addCharacter);
        router.put('/api/characters/:characterId', gamesController.updateCharacter);
        router.delete('/api/characters/:characterId', gamesController.deleteCharacter);

        // Tournament Routes
        router.get('/api/tournaments', tournamentsController.getAllTournaments);
        router.get('/api/tournaments/:id', tournamentsController.getTournamentById);
        router.post('/api/tournaments', tournamentsController.createTournament);
        router.put('/api/tournaments/:id', tournamentsController.updateTournament);
        router.delete('/api/tournaments/:id', tournamentsController.deleteTournament);

        // Tournament Game Relationships
        router.post('/api/tournaments/:tournamentId/games', tournamentsController.addGameToTournament);
        router.delete('/api/tournaments/:tournamentId/games/:gameId', tournamentsController.removeGameFromTournament);

        // Tournament Stages
        router.post('/api/tournaments/:tournamentId/stages', tournamentsController.addTournamentStage);
        router.put('/api/stages/:stageId', tournamentsController.updateTournamentStage);
        router.delete('/api/stages/:stageId', tournamentsController.deleteTournamentStage);

        // SEED
        router.post('/api/seed/reset', seedController.resetDatabase);

        return router;
    }
}