import { AppRoutes } from "./routes";
import { Server } from "./server";

(() => {
    main();
})();

function main() {
    const server = new Server({
        port: 8080,
        routes: AppRoutes.routes,
    });

    server.start();
}