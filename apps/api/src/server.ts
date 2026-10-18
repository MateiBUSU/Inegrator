import { createApp } from "./app";
import { env } from "./config/env";

const onListening = () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
};

if (env.HOST) createApp().listen(env.PORT, env.HOST, onListening);
else createApp().listen(env.PORT, onListening);
