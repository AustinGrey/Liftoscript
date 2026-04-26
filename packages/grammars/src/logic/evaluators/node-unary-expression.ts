import type { LogicHandler } from "@/logic/evaluators/types.ts";
import {queryChildren} from "@/utils/grammars.ts";

export const handler: LogicHandler<"UnaryExpression"> = (n, t) => {
    const [, expression] = queryChildren(n, { atLeast: 2 });
    // @TODO Why is this notted?
    return !t.recurse(expression);
};
