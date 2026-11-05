import { startApp } from "@arrow-warfare/game";

Object.assign(window, { arrows: await startApp() });
