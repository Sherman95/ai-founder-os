function createInspectSchemasTool({ notionProvider }) {
  return async function inspectSchemasTool() {
    await notionProvider.inspectSchemas();
    return {
      ok: true,
      message: "Schema validation passed",
      time: new Date().toISOString(),
    };
  };
}

module.exports = { createInspectSchemasTool };
