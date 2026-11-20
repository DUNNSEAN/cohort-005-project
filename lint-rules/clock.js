// A function that reads the clock cannot be tested at a fixed moment. Module
// code takes the time as an argument; the route reads the clock and passes
// it in.

const isDateNow = (node) =>
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === "Date" &&
  node.callee.property.name === "now";

const noAmbientNow = {
  meta: {
    type: "problem",
    messages: {
      ambient:
        "Take the time as an argument instead of reading the clock here. See CODING_STANDARDS.md, Inject the clock.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isDateNow(node)) context.report({ node, messageId: "ambient" });
      },
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Date" &&
          node.arguments.length === 0
        ) {
          context.report({ node, messageId: "ambient" });
        }
      },
    };
  },
};

export default {
  meta: { name: "clock" },
  rules: { "no-ambient-now": noAmbientNow },
};
