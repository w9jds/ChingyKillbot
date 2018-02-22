import * as admin from 'firebase-admin';
import * as moment from 'moment';
import * as cert from './config/neweden-admin.json';

import Killbot from './deaths';
import { Server, Request, ResponseToolkit } from 'hapi';

let firebase = admin.initializeApp({
    credential: admin.credential.cert(cert as admin.ServiceAccount),
    databaseURL: process.env.DATABASE_URL
});

const killbot = new Killbot(firebase.database());

const server: Server = new Server({
    port: process.env.PORT || 8000,
    host: '0.0.0.0'
});

async function init(): Promise<Server> {
    createHealthRoutes();

    await server.start();

    return server;
}

const createHealthRoutes = () => {
    server.route({
        method: 'GET',
        path: '/_status/healthz',
        handler: (request: Request, h: ResponseToolkit) => {
            if (moment().subtract(1, 'minute').isAfter(killbot.lastRun)) {
                console.info(`Restarting Integrations, hasn't run since ${killbot.lastRun.format('hh:mm:ss')}`);
                killbot.start(moment());
            }

            return h.response();
        }
    });
}

init().then(server => {
    console.log('Server running at:', server.info.uri);
    console.log('Killbot service started');
    killbot.start(moment());
}).catch(error => {
    console.log(error);  
});