// Number(), parseInt() and parseFloat() accept anything: Number("") is 0, and
// an empty lessonId once opened lesson 0 for every learner. Route params,
// form data and search params go through a zod schema instead, which rejects
// what is not a number.

const COERCIONS = new Set(["Number", "parseInt", "parseFloat"]);

const unwrap = (node) =>
  node &&
  (node.type === "TSAsExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ChainExpression")
    ? unwrap(node.expression)
    : node;

// params.lessonId, params["lessonId"]
const isRouteParam = (node) =>
  node.type === "MemberExpression" &&
  node.object.type === "Identifier" &&
  node.object.name === "params";

// formData.get("quizId"), url.searchParams.get("page")
const isFormOrSearchParam = (node) =>
  node.type === "CallExpression" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.name === "get" &&
  node.arguments[0]?.type === "Literal";

const noNumberCoercion = {
  meta: {
    type: "problem",
    messages: {
      coerced:
        'Parse untrusted input with a zod schema (z.coerce.number().int().positive()), not {{name}}(): {{name}}("") is 0. See CODING_STANDARDS.md, Parse untrusted input with a schema.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        if (!COERCIONS.has(node.callee.name)) return;
        const arg = unwrap(node.arguments[0]);
        if (!arg || !(isRouteParam(arg) || isFormOrSearchParam(arg))) return;
        context.report({
          node,
          messageId: "coerced",
          data: { name: node.callee.name },
        });
      },
    };
  },
};

export default {
  meta: { name: "input" },
  rules: { "no-number-coercion": noNumberCoercion },
};
