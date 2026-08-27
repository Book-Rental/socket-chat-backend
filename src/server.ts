import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
} from "./types/types";
import { registerOneToOneHandlers } from "./components/oneToOneHandler";
import { registerBroadcastHandlers } from "./components/broadcastHandler";
import { registerRoomHandlers } from "./components/roomHandler";
import { registerGroupHandlers } from "./components/groupHandler";


const app = express();

const server =
    http.createServer(app);


app.use(
    cors({
        origin:
            "http://localhost:5173"
    })
);


app.use(
    express.json()
);


type IOServer = Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;


const io: IOServer =
    new Server(
        server,
        {
            cors: {
                origin:
                    "http://localhost:5173",

                methods: [
                    "GET",
                    "POST"
                ]
            }
        }
    );


/*
 * Test API
 */
app.get(
    "/",
    (_req, res) => {

        res.json({
            message:
                "Socket.IO server is running"
        });
    }
);


/*
 * Socket connection
 */
io.on(
    "connection",
    (socket) => {

        console.log(
            "Socket connected:",
            socket.id
        );


        /*
         * One-to-One
         */
        registerOneToOneHandlers(
            io,
            socket
        );


        /*
         * Broadcast
         */
        registerBroadcastHandlers(
            io,
            socket
        );


        /*
         * Rooms
         */
        registerRoomHandlers(
            io,
            socket
        );
        registerGroupHandlers(
            io,
            socket
        );
    }
);


const PORT =
    Number(
        process.env.PORT
    ) || 5000;


server.listen(
    PORT,
    () => {

        console.log(
            `Server running on port ${PORT}`
        );
    }
);