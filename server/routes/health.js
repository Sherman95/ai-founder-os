const express = require("express");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    version: "0.3.0",
  });
});

module.exports = router;
