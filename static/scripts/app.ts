import { drawInit } from "./draw";
import { pay } from "./pay";
import { renderTransaction } from "./render-transaction";

const init = async () => {
  await drawInit();
  await renderTransaction();
  await pay();
};

init();
