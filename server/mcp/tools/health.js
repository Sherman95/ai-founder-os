const env = require("../../config/env");

function createHealthTool({ startedAt }) {
  return async function healthTool() {
    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    return {
      status: "ok",
      version: "0.2.0",
      uptimeSec,
      notionMode: env.NOTION_MODE,
      time: new Date().toISOString(),
    };
  };
}

module.exports = { createHealthTool };
