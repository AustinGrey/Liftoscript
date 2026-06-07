import type { LogicHandler, Validator } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";

export const handler: LogicHandler<"BuiltinFunctionExpression"> = (n, t) => {
  const fns = t.publicFunctions;
  const [keyword, ...args] = queryChildren(n, { atLeast: 1 });
  // @todo find an alternative to referencing "NodeName" here, either use the NodeNames_Logic structure, or improve query children to allow for a pattern of nodes to expect.
  if (keyword.type.name !== NodeName.Keyword) {
    return t.error(
      `Expected ${NodeName.Keyword} node as first child of node, but got ${keyword.type.name}`,
      n,
    );
  }
  const name = keyword.source as keyof typeof fns;
  if (name != null && fns[name] != null) {
    const argValues = args.map((a) => t.recurse(a));
    const fn = fns[name];
    // @todo we can remove most of this any if we force all public functions to accept the IScriptFnContext as the first argument instead of as the last one, and also enforce that they can only return a LogicResult!
    //     even then.... why not just pipe the entire tools object into the function?
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fn as any).apply(undefined, [...argValues, t.fnContext, t]);
  } else {
    return t.error(`Unknown function '${name}'`, keyword);
  }
};

export const validator: Validator<"BuiltinFunctionExpression"> = (n, t)=>{

}