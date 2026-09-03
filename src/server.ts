import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import messageRoutes from "./routes/messageRoutes";
import conversationRoutes from "./routes/conversationRoutes";

import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
} from "./types/types";

import {
    registerOneToOneHandlers,
} from "./components/oneToOneHandler";

// import {
//     registerBroadcastHandlers,
// } from "./components/broadcastHandler";

import {
    registerRoomHandlers,
} from "./components/roomHandler";

import {
    registerGroupHandlers,
} from "./components/groupHandler";

import {
    connectDatabase,
} from "./config/database";


const allowedOrigins = [
    "http://localhost:5173",
    "https://socket-io-frontend-c3wf.onrender.com",
];


const app = express();

const server = http.createServer(app);

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    })
);

app.use(express.json());

type IOServer = Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;

const io: IOServer = new Server(
    server,
    {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"],
            credentials: true,
        },
    }
);

app.get("/", (_req, res) => {
    res.json({
        message: "Socket.IO server is running",
    });
});


app.use(
    "/api/messages",
    messageRoutes
);

app.use(
    "/api/conversations",
    conversationRoutes
);

io.on(
    "connection",
    (socket) => {

        console.log(
            "Socket connected:",
            socket.id
        );


        // One-to-One chat
        registerOneToOneHandlers(
            io,
            socket
        );


        // Broadcast messages
        // registerBroadcastHandlers(
        //     io,
        //     socket
        // );


        // Room messages
        registerRoomHandlers(
            io,
            socket
        );


        // Group messages
        registerGroupHandlers(
            io,
            socket
        );
    }
);


const PORT =
    Number(process.env.PORT) || 5000;


const startServer =
    async (): Promise<void> => {

        try {

            await connectDatabase();

            server.listen(
                PORT,
                () => {
                    console.log(
                        `Server running on port ${PORT} `
                    );
                }
            );

        } catch (error) {

            console.error(
                "Failed to start server:",
                error
            );

            process.exit(1);
        }
    };


startServer();
