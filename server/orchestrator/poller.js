const pino = require("pino");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

function createPoller({ intervalMs, queryFn, runFn }) {
  let timer = null;
  let isProcessing = false;

  const tick = async () => {
    if (isProcessing) {
      logger.info({ ts: new Date().toISOString() }, "Poller skipped tick: workflow already running");
      return;
    }

    isProcessing = true;

    try {
      const ideas = await queryFn();
      if (!ideas.length) {
        logger.info({ ts: new Date().toISOString() }, "Poller tick complete: no ideas queued");
        return;
      }

      const nextIdea = ideas[0];
      logger.info(
        { ts: new Date().toISOString(), ideaId: nextIdea.id, title: nextIdea.title },
        "Poller picked startup idea"
      );
      await runFn(nextIdea);
    } catch (error) {
      logger.error({ ts: new Date().toISOString(), err: error?.message }, "Poller tick failed");
    } finally {
      isProcessing = false;
    }
  };

  return {
    start() {
      if (timer) {
        logger.warn({ ts: new Date().toISOString() }, "Poller already running");
        return;
      }

      logger.info({ ts: new Date().toISOString(), intervalMs }, "Starting poller");
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        logger.info({ ts: new Date().toISOString() }, "Poller stopped");
      }
    },
  };
}

module.exports = { createPoller };
