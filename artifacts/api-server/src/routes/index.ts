import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dataRouter from "./data";
import netsuiteRouter from "./netsuite";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dataRouter);
router.use(netsuiteRouter);

export default router;
