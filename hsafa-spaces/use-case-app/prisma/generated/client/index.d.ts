
/**
 * Client
**/

import * as runtime from './runtime/client.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model Entity
 * 
 */
export type Entity = $Result.DefaultSelection<Prisma.$EntityPayload>
/**
 * Model SmartSpace
 * 
 */
export type SmartSpace = $Result.DefaultSelection<Prisma.$SmartSpacePayload>
/**
 * Model SmartSpaceMembership
 * 
 */
export type SmartSpaceMembership = $Result.DefaultSelection<Prisma.$SmartSpaceMembershipPayload>
/**
 * Model SmartSpaceMessage
 * 
 */
export type SmartSpaceMessage = $Result.DefaultSelection<Prisma.$SmartSpaceMessagePayload>
/**
 * Model Client
 * 
 */
export type Client = $Result.DefaultSelection<Prisma.$ClientPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const EntityType: {
  human: 'human',
  agent: 'agent'
};

export type EntityType = (typeof EntityType)[keyof typeof EntityType]

}

export type EntityType = $Enums.EntityType

export const EntityType: typeof $Enums.EntityType

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Users
   * const users = await prisma.user.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://pris.ly/d/client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>

  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.entity`: Exposes CRUD operations for the **Entity** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Entities
    * const entities = await prisma.entity.findMany()
    * ```
    */
  get entity(): Prisma.EntityDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.smartSpace`: Exposes CRUD operations for the **SmartSpace** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SmartSpaces
    * const smartSpaces = await prisma.smartSpace.findMany()
    * ```
    */
  get smartSpace(): Prisma.SmartSpaceDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.smartSpaceMembership`: Exposes CRUD operations for the **SmartSpaceMembership** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SmartSpaceMemberships
    * const smartSpaceMemberships = await prisma.smartSpaceMembership.findMany()
    * ```
    */
  get smartSpaceMembership(): Prisma.SmartSpaceMembershipDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.smartSpaceMessage`: Exposes CRUD operations for the **SmartSpaceMessage** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SmartSpaceMessages
    * const smartSpaceMessages = await prisma.smartSpaceMessage.findMany()
    * ```
    */
  get smartSpaceMessage(): Prisma.SmartSpaceMessageDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.client`: Exposes CRUD operations for the **Client** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Clients
    * const clients = await prisma.client.findMany()
    * ```
    */
  get client(): Prisma.ClientDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 7.4.1
   * Query Engine version: 55ae170b1ced7fc6ed07a15f110549408c501bb3
   */
  export type PrismaVersion = {
    client: string
    engine: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    User: 'User',
    Entity: 'Entity',
    SmartSpace: 'SmartSpace',
    SmartSpaceMembership: 'SmartSpaceMembership',
    SmartSpaceMessage: 'SmartSpaceMessage',
    Client: 'Client'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]



  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "user" | "entity" | "smartSpace" | "smartSpaceMembership" | "smartSpaceMessage" | "client"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      Entity: {
        payload: Prisma.$EntityPayload<ExtArgs>
        fields: Prisma.EntityFieldRefs
        operations: {
          findUnique: {
            args: Prisma.EntityFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.EntityFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>
          }
          findFirst: {
            args: Prisma.EntityFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.EntityFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>
          }
          findMany: {
            args: Prisma.EntityFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>[]
          }
          create: {
            args: Prisma.EntityCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>
          }
          createMany: {
            args: Prisma.EntityCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.EntityCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>[]
          }
          delete: {
            args: Prisma.EntityDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>
          }
          update: {
            args: Prisma.EntityUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>
          }
          deleteMany: {
            args: Prisma.EntityDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.EntityUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.EntityUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>[]
          }
          upsert: {
            args: Prisma.EntityUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EntityPayload>
          }
          aggregate: {
            args: Prisma.EntityAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateEntity>
          }
          groupBy: {
            args: Prisma.EntityGroupByArgs<ExtArgs>
            result: $Utils.Optional<EntityGroupByOutputType>[]
          }
          count: {
            args: Prisma.EntityCountArgs<ExtArgs>
            result: $Utils.Optional<EntityCountAggregateOutputType> | number
          }
        }
      }
      SmartSpace: {
        payload: Prisma.$SmartSpacePayload<ExtArgs>
        fields: Prisma.SmartSpaceFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SmartSpaceFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SmartSpaceFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>
          }
          findFirst: {
            args: Prisma.SmartSpaceFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SmartSpaceFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>
          }
          findMany: {
            args: Prisma.SmartSpaceFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>[]
          }
          create: {
            args: Prisma.SmartSpaceCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>
          }
          createMany: {
            args: Prisma.SmartSpaceCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SmartSpaceCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>[]
          }
          delete: {
            args: Prisma.SmartSpaceDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>
          }
          update: {
            args: Prisma.SmartSpaceUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>
          }
          deleteMany: {
            args: Prisma.SmartSpaceDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SmartSpaceUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SmartSpaceUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>[]
          }
          upsert: {
            args: Prisma.SmartSpaceUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpacePayload>
          }
          aggregate: {
            args: Prisma.SmartSpaceAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSmartSpace>
          }
          groupBy: {
            args: Prisma.SmartSpaceGroupByArgs<ExtArgs>
            result: $Utils.Optional<SmartSpaceGroupByOutputType>[]
          }
          count: {
            args: Prisma.SmartSpaceCountArgs<ExtArgs>
            result: $Utils.Optional<SmartSpaceCountAggregateOutputType> | number
          }
        }
      }
      SmartSpaceMembership: {
        payload: Prisma.$SmartSpaceMembershipPayload<ExtArgs>
        fields: Prisma.SmartSpaceMembershipFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SmartSpaceMembershipFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SmartSpaceMembershipFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>
          }
          findFirst: {
            args: Prisma.SmartSpaceMembershipFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SmartSpaceMembershipFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>
          }
          findMany: {
            args: Prisma.SmartSpaceMembershipFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>[]
          }
          create: {
            args: Prisma.SmartSpaceMembershipCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>
          }
          createMany: {
            args: Prisma.SmartSpaceMembershipCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SmartSpaceMembershipCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>[]
          }
          delete: {
            args: Prisma.SmartSpaceMembershipDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>
          }
          update: {
            args: Prisma.SmartSpaceMembershipUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>
          }
          deleteMany: {
            args: Prisma.SmartSpaceMembershipDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SmartSpaceMembershipUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SmartSpaceMembershipUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>[]
          }
          upsert: {
            args: Prisma.SmartSpaceMembershipUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMembershipPayload>
          }
          aggregate: {
            args: Prisma.SmartSpaceMembershipAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSmartSpaceMembership>
          }
          groupBy: {
            args: Prisma.SmartSpaceMembershipGroupByArgs<ExtArgs>
            result: $Utils.Optional<SmartSpaceMembershipGroupByOutputType>[]
          }
          count: {
            args: Prisma.SmartSpaceMembershipCountArgs<ExtArgs>
            result: $Utils.Optional<SmartSpaceMembershipCountAggregateOutputType> | number
          }
        }
      }
      SmartSpaceMessage: {
        payload: Prisma.$SmartSpaceMessagePayload<ExtArgs>
        fields: Prisma.SmartSpaceMessageFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SmartSpaceMessageFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SmartSpaceMessageFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>
          }
          findFirst: {
            args: Prisma.SmartSpaceMessageFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SmartSpaceMessageFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>
          }
          findMany: {
            args: Prisma.SmartSpaceMessageFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>[]
          }
          create: {
            args: Prisma.SmartSpaceMessageCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>
          }
          createMany: {
            args: Prisma.SmartSpaceMessageCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SmartSpaceMessageCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>[]
          }
          delete: {
            args: Prisma.SmartSpaceMessageDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>
          }
          update: {
            args: Prisma.SmartSpaceMessageUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>
          }
          deleteMany: {
            args: Prisma.SmartSpaceMessageDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SmartSpaceMessageUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SmartSpaceMessageUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>[]
          }
          upsert: {
            args: Prisma.SmartSpaceMessageUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SmartSpaceMessagePayload>
          }
          aggregate: {
            args: Prisma.SmartSpaceMessageAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSmartSpaceMessage>
          }
          groupBy: {
            args: Prisma.SmartSpaceMessageGroupByArgs<ExtArgs>
            result: $Utils.Optional<SmartSpaceMessageGroupByOutputType>[]
          }
          count: {
            args: Prisma.SmartSpaceMessageCountArgs<ExtArgs>
            result: $Utils.Optional<SmartSpaceMessageCountAggregateOutputType> | number
          }
        }
      }
      Client: {
        payload: Prisma.$ClientPayload<ExtArgs>
        fields: Prisma.ClientFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ClientFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ClientFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          findFirst: {
            args: Prisma.ClientFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ClientFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          findMany: {
            args: Prisma.ClientFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>[]
          }
          create: {
            args: Prisma.ClientCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          createMany: {
            args: Prisma.ClientCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ClientCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>[]
          }
          delete: {
            args: Prisma.ClientDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          update: {
            args: Prisma.ClientUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          deleteMany: {
            args: Prisma.ClientDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ClientUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ClientUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>[]
          }
          upsert: {
            args: Prisma.ClientUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          aggregate: {
            args: Prisma.ClientAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateClient>
          }
          groupBy: {
            args: Prisma.ClientGroupByArgs<ExtArgs>
            result: $Utils.Optional<ClientGroupByOutputType>[]
          }
          count: {
            args: Prisma.ClientCountArgs<ExtArgs>
            result: $Utils.Optional<ClientCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://pris.ly/d/logging).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory
    /**
     * Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.
     */
    accelerateUrl?: string
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
    /**
     * SQL commenter plugins that add metadata to SQL queries as comments.
     * Comments follow the sqlcommenter format: https://google.github.io/sqlcommenter/
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   adapter,
     *   comments: [
     *     traceContext(),
     *     queryInsights(),
     *   ],
     * })
     * ```
     */
    comments?: runtime.SqlCommenterPlugin[]
  }
  export type GlobalOmitConfig = {
    user?: UserOmit
    entity?: EntityOmit
    smartSpace?: SmartSpaceOmit
    smartSpaceMembership?: SmartSpaceMembershipOmit
    smartSpaceMessage?: SmartSpaceMessageOmit
    client?: ClientOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type EntityCountOutputType
   */

  export type EntityCountOutputType = {
    smartSpaceMemberships: number
    messages: number
    clients: number
  }

  export type EntityCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpaceMemberships?: boolean | EntityCountOutputTypeCountSmartSpaceMembershipsArgs
    messages?: boolean | EntityCountOutputTypeCountMessagesArgs
    clients?: boolean | EntityCountOutputTypeCountClientsArgs
  }

  // Custom InputTypes
  /**
   * EntityCountOutputType without action
   */
  export type EntityCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EntityCountOutputType
     */
    select?: EntityCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * EntityCountOutputType without action
   */
  export type EntityCountOutputTypeCountSmartSpaceMembershipsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SmartSpaceMembershipWhereInput
  }

  /**
   * EntityCountOutputType without action
   */
  export type EntityCountOutputTypeCountMessagesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SmartSpaceMessageWhereInput
  }

  /**
   * EntityCountOutputType without action
   */
  export type EntityCountOutputTypeCountClientsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ClientWhereInput
  }


  /**
   * Count Type SmartSpaceCountOutputType
   */

  export type SmartSpaceCountOutputType = {
    memberships: number
    messages: number
  }

  export type SmartSpaceCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    memberships?: boolean | SmartSpaceCountOutputTypeCountMembershipsArgs
    messages?: boolean | SmartSpaceCountOutputTypeCountMessagesArgs
  }

  // Custom InputTypes
  /**
   * SmartSpaceCountOutputType without action
   */
  export type SmartSpaceCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceCountOutputType
     */
    select?: SmartSpaceCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SmartSpaceCountOutputType without action
   */
  export type SmartSpaceCountOutputTypeCountMembershipsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SmartSpaceMembershipWhereInput
  }

  /**
   * SmartSpaceCountOutputType without action
   */
  export type SmartSpaceCountOutputTypeCountMessagesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SmartSpaceMessageWhereInput
  }


  /**
   * Models
   */

  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserMinAggregateOutputType = {
    id: string | null
    email: string | null
    name: string | null
    passwordHash: string | null
    hsafaEntityId: string | null
    hsafaSpaceId: string | null
    agentEntityId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserMaxAggregateOutputType = {
    id: string | null
    email: string | null
    name: string | null
    passwordHash: string | null
    hsafaEntityId: string | null
    hsafaSpaceId: string | null
    agentEntityId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    email: number
    name: number
    passwordHash: number
    hsafaEntityId: number
    hsafaSpaceId: number
    agentEntityId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type UserMinAggregateInputType = {
    id?: true
    email?: true
    name?: true
    passwordHash?: true
    hsafaEntityId?: true
    hsafaSpaceId?: true
    agentEntityId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    email?: true
    name?: true
    passwordHash?: true
    hsafaEntityId?: true
    hsafaSpaceId?: true
    agentEntityId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    email?: true
    name?: true
    passwordHash?: true
    hsafaEntityId?: true
    hsafaSpaceId?: true
    agentEntityId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: string
    email: string
    name: string
    passwordHash: string
    hsafaEntityId: string | null
    hsafaSpaceId: string | null
    agentEntityId: string | null
    createdAt: Date
    updatedAt: Date
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    name?: boolean
    passwordHash?: boolean
    hsafaEntityId?: boolean
    hsafaSpaceId?: boolean
    agentEntityId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    name?: boolean
    passwordHash?: boolean
    hsafaEntityId?: boolean
    hsafaSpaceId?: boolean
    agentEntityId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    name?: boolean
    passwordHash?: boolean
    hsafaEntityId?: boolean
    hsafaSpaceId?: boolean
    agentEntityId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectScalar = {
    id?: boolean
    email?: boolean
    name?: boolean
    passwordHash?: boolean
    hsafaEntityId?: boolean
    hsafaSpaceId?: boolean
    agentEntityId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "email" | "name" | "passwordHash" | "hsafaEntityId" | "hsafaSpaceId" | "agentEntityId" | "createdAt" | "updatedAt", ExtArgs["result"]["user"]>

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      email: string
      name: string
      passwordHash: string
      hsafaEntityId: string | null
      hsafaSpaceId: string | null
      agentEntityId: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users and returns the data updated in the database.
     * @param {UserUpdateManyAndReturnArgs} args - Arguments to update many Users.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Users and only return the `id`
     * const userWithIdOnly = await prisma.user.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserUpdateManyAndReturnArgs>(args: SelectSubset<T, UserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly name: FieldRef<"User", 'String'>
    readonly passwordHash: FieldRef<"User", 'String'>
    readonly hsafaEntityId: FieldRef<"User", 'String'>
    readonly hsafaSpaceId: FieldRef<"User", 'String'>
    readonly agentEntityId: FieldRef<"User", 'String'>
    readonly createdAt: FieldRef<"User", 'DateTime'>
    readonly updatedAt: FieldRef<"User", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User createManyAndReturn
   */
  export type UserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User updateManyAndReturn
   */
  export type UserUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
  }


  /**
   * Model Entity
   */

  export type AggregateEntity = {
    _count: EntityCountAggregateOutputType | null
    _min: EntityMinAggregateOutputType | null
    _max: EntityMaxAggregateOutputType | null
  }

  export type EntityMinAggregateOutputType = {
    id: string | null
    type: $Enums.EntityType | null
    externalId: string | null
    displayName: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EntityMaxAggregateOutputType = {
    id: string | null
    type: $Enums.EntityType | null
    externalId: string | null
    displayName: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type EntityCountAggregateOutputType = {
    id: number
    type: number
    externalId: number
    displayName: number
    metadata: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type EntityMinAggregateInputType = {
    id?: true
    type?: true
    externalId?: true
    displayName?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EntityMaxAggregateInputType = {
    id?: true
    type?: true
    externalId?: true
    displayName?: true
    createdAt?: true
    updatedAt?: true
  }

  export type EntityCountAggregateInputType = {
    id?: true
    type?: true
    externalId?: true
    displayName?: true
    metadata?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type EntityAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Entity to aggregate.
     */
    where?: EntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Entities to fetch.
     */
    orderBy?: EntityOrderByWithRelationInput | EntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: EntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Entities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Entities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Entities
    **/
    _count?: true | EntityCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: EntityMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: EntityMaxAggregateInputType
  }

  export type GetEntityAggregateType<T extends EntityAggregateArgs> = {
        [P in keyof T & keyof AggregateEntity]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateEntity[P]>
      : GetScalarType<T[P], AggregateEntity[P]>
  }




  export type EntityGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EntityWhereInput
    orderBy?: EntityOrderByWithAggregationInput | EntityOrderByWithAggregationInput[]
    by: EntityScalarFieldEnum[] | EntityScalarFieldEnum
    having?: EntityScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: EntityCountAggregateInputType | true
    _min?: EntityMinAggregateInputType
    _max?: EntityMaxAggregateInputType
  }

  export type EntityGroupByOutputType = {
    id: string
    type: $Enums.EntityType
    externalId: string | null
    displayName: string | null
    metadata: JsonValue | null
    createdAt: Date
    updatedAt: Date
    _count: EntityCountAggregateOutputType | null
    _min: EntityMinAggregateOutputType | null
    _max: EntityMaxAggregateOutputType | null
  }

  type GetEntityGroupByPayload<T extends EntityGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<EntityGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof EntityGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], EntityGroupByOutputType[P]>
            : GetScalarType<T[P], EntityGroupByOutputType[P]>
        }
      >
    >


  export type EntitySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    externalId?: boolean
    displayName?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    smartSpaceMemberships?: boolean | Entity$smartSpaceMembershipsArgs<ExtArgs>
    messages?: boolean | Entity$messagesArgs<ExtArgs>
    clients?: boolean | Entity$clientsArgs<ExtArgs>
    _count?: boolean | EntityCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["entity"]>

  export type EntitySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    externalId?: boolean
    displayName?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["entity"]>

  export type EntitySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    externalId?: boolean
    displayName?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["entity"]>

  export type EntitySelectScalar = {
    id?: boolean
    type?: boolean
    externalId?: boolean
    displayName?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type EntityOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "type" | "externalId" | "displayName" | "metadata" | "createdAt" | "updatedAt", ExtArgs["result"]["entity"]>
  export type EntityInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpaceMemberships?: boolean | Entity$smartSpaceMembershipsArgs<ExtArgs>
    messages?: boolean | Entity$messagesArgs<ExtArgs>
    clients?: boolean | Entity$clientsArgs<ExtArgs>
    _count?: boolean | EntityCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type EntityIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type EntityIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $EntityPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Entity"
    objects: {
      smartSpaceMemberships: Prisma.$SmartSpaceMembershipPayload<ExtArgs>[]
      messages: Prisma.$SmartSpaceMessagePayload<ExtArgs>[]
      clients: Prisma.$ClientPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      type: $Enums.EntityType
      externalId: string | null
      displayName: string | null
      metadata: Prisma.JsonValue | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["entity"]>
    composites: {}
  }

  type EntityGetPayload<S extends boolean | null | undefined | EntityDefaultArgs> = $Result.GetResult<Prisma.$EntityPayload, S>

  type EntityCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<EntityFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: EntityCountAggregateInputType | true
    }

  export interface EntityDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Entity'], meta: { name: 'Entity' } }
    /**
     * Find zero or one Entity that matches the filter.
     * @param {EntityFindUniqueArgs} args - Arguments to find a Entity
     * @example
     * // Get one Entity
     * const entity = await prisma.entity.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EntityFindUniqueArgs>(args: SelectSubset<T, EntityFindUniqueArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Entity that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EntityFindUniqueOrThrowArgs} args - Arguments to find a Entity
     * @example
     * // Get one Entity
     * const entity = await prisma.entity.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EntityFindUniqueOrThrowArgs>(args: SelectSubset<T, EntityFindUniqueOrThrowArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Entity that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EntityFindFirstArgs} args - Arguments to find a Entity
     * @example
     * // Get one Entity
     * const entity = await prisma.entity.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EntityFindFirstArgs>(args?: SelectSubset<T, EntityFindFirstArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Entity that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EntityFindFirstOrThrowArgs} args - Arguments to find a Entity
     * @example
     * // Get one Entity
     * const entity = await prisma.entity.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EntityFindFirstOrThrowArgs>(args?: SelectSubset<T, EntityFindFirstOrThrowArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Entities that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EntityFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Entities
     * const entities = await prisma.entity.findMany()
     * 
     * // Get first 10 Entities
     * const entities = await prisma.entity.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const entityWithIdOnly = await prisma.entity.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends EntityFindManyArgs>(args?: SelectSubset<T, EntityFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Entity.
     * @param {EntityCreateArgs} args - Arguments to create a Entity.
     * @example
     * // Create one Entity
     * const Entity = await prisma.entity.create({
     *   data: {
     *     // ... data to create a Entity
     *   }
     * })
     * 
     */
    create<T extends EntityCreateArgs>(args: SelectSubset<T, EntityCreateArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Entities.
     * @param {EntityCreateManyArgs} args - Arguments to create many Entities.
     * @example
     * // Create many Entities
     * const entity = await prisma.entity.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends EntityCreateManyArgs>(args?: SelectSubset<T, EntityCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Entities and returns the data saved in the database.
     * @param {EntityCreateManyAndReturnArgs} args - Arguments to create many Entities.
     * @example
     * // Create many Entities
     * const entity = await prisma.entity.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Entities and only return the `id`
     * const entityWithIdOnly = await prisma.entity.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends EntityCreateManyAndReturnArgs>(args?: SelectSubset<T, EntityCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Entity.
     * @param {EntityDeleteArgs} args - Arguments to delete one Entity.
     * @example
     * // Delete one Entity
     * const Entity = await prisma.entity.delete({
     *   where: {
     *     // ... filter to delete one Entity
     *   }
     * })
     * 
     */
    delete<T extends EntityDeleteArgs>(args: SelectSubset<T, EntityDeleteArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Entity.
     * @param {EntityUpdateArgs} args - Arguments to update one Entity.
     * @example
     * // Update one Entity
     * const entity = await prisma.entity.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends EntityUpdateArgs>(args: SelectSubset<T, EntityUpdateArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Entities.
     * @param {EntityDeleteManyArgs} args - Arguments to filter Entities to delete.
     * @example
     * // Delete a few Entities
     * const { count } = await prisma.entity.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends EntityDeleteManyArgs>(args?: SelectSubset<T, EntityDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Entities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EntityUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Entities
     * const entity = await prisma.entity.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends EntityUpdateManyArgs>(args: SelectSubset<T, EntityUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Entities and returns the data updated in the database.
     * @param {EntityUpdateManyAndReturnArgs} args - Arguments to update many Entities.
     * @example
     * // Update many Entities
     * const entity = await prisma.entity.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Entities and only return the `id`
     * const entityWithIdOnly = await prisma.entity.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends EntityUpdateManyAndReturnArgs>(args: SelectSubset<T, EntityUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Entity.
     * @param {EntityUpsertArgs} args - Arguments to update or create a Entity.
     * @example
     * // Update or create a Entity
     * const entity = await prisma.entity.upsert({
     *   create: {
     *     // ... data to create a Entity
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Entity we want to update
     *   }
     * })
     */
    upsert<T extends EntityUpsertArgs>(args: SelectSubset<T, EntityUpsertArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Entities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EntityCountArgs} args - Arguments to filter Entities to count.
     * @example
     * // Count the number of Entities
     * const count = await prisma.entity.count({
     *   where: {
     *     // ... the filter for the Entities we want to count
     *   }
     * })
    **/
    count<T extends EntityCountArgs>(
      args?: Subset<T, EntityCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], EntityCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Entity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EntityAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends EntityAggregateArgs>(args: Subset<T, EntityAggregateArgs>): Prisma.PrismaPromise<GetEntityAggregateType<T>>

    /**
     * Group by Entity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EntityGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends EntityGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: EntityGroupByArgs['orderBy'] }
        : { orderBy?: EntityGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, EntityGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEntityGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Entity model
   */
  readonly fields: EntityFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Entity.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__EntityClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    smartSpaceMemberships<T extends Entity$smartSpaceMembershipsArgs<ExtArgs> = {}>(args?: Subset<T, Entity$smartSpaceMembershipsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    messages<T extends Entity$messagesArgs<ExtArgs> = {}>(args?: Subset<T, Entity$messagesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    clients<T extends Entity$clientsArgs<ExtArgs> = {}>(args?: Subset<T, Entity$clientsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Entity model
   */
  interface EntityFieldRefs {
    readonly id: FieldRef<"Entity", 'String'>
    readonly type: FieldRef<"Entity", 'EntityType'>
    readonly externalId: FieldRef<"Entity", 'String'>
    readonly displayName: FieldRef<"Entity", 'String'>
    readonly metadata: FieldRef<"Entity", 'Json'>
    readonly createdAt: FieldRef<"Entity", 'DateTime'>
    readonly updatedAt: FieldRef<"Entity", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Entity findUnique
   */
  export type EntityFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * Filter, which Entity to fetch.
     */
    where: EntityWhereUniqueInput
  }

  /**
   * Entity findUniqueOrThrow
   */
  export type EntityFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * Filter, which Entity to fetch.
     */
    where: EntityWhereUniqueInput
  }

  /**
   * Entity findFirst
   */
  export type EntityFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * Filter, which Entity to fetch.
     */
    where?: EntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Entities to fetch.
     */
    orderBy?: EntityOrderByWithRelationInput | EntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Entities.
     */
    cursor?: EntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Entities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Entities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Entities.
     */
    distinct?: EntityScalarFieldEnum | EntityScalarFieldEnum[]
  }

  /**
   * Entity findFirstOrThrow
   */
  export type EntityFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * Filter, which Entity to fetch.
     */
    where?: EntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Entities to fetch.
     */
    orderBy?: EntityOrderByWithRelationInput | EntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Entities.
     */
    cursor?: EntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Entities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Entities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Entities.
     */
    distinct?: EntityScalarFieldEnum | EntityScalarFieldEnum[]
  }

  /**
   * Entity findMany
   */
  export type EntityFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * Filter, which Entities to fetch.
     */
    where?: EntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Entities to fetch.
     */
    orderBy?: EntityOrderByWithRelationInput | EntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Entities.
     */
    cursor?: EntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Entities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Entities.
     */
    skip?: number
    distinct?: EntityScalarFieldEnum | EntityScalarFieldEnum[]
  }

  /**
   * Entity create
   */
  export type EntityCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * The data needed to create a Entity.
     */
    data: XOR<EntityCreateInput, EntityUncheckedCreateInput>
  }

  /**
   * Entity createMany
   */
  export type EntityCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Entities.
     */
    data: EntityCreateManyInput | EntityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Entity createManyAndReturn
   */
  export type EntityCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * The data used to create many Entities.
     */
    data: EntityCreateManyInput | EntityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Entity update
   */
  export type EntityUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * The data needed to update a Entity.
     */
    data: XOR<EntityUpdateInput, EntityUncheckedUpdateInput>
    /**
     * Choose, which Entity to update.
     */
    where: EntityWhereUniqueInput
  }

  /**
   * Entity updateMany
   */
  export type EntityUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Entities.
     */
    data: XOR<EntityUpdateManyMutationInput, EntityUncheckedUpdateManyInput>
    /**
     * Filter which Entities to update
     */
    where?: EntityWhereInput
    /**
     * Limit how many Entities to update.
     */
    limit?: number
  }

  /**
   * Entity updateManyAndReturn
   */
  export type EntityUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * The data used to update Entities.
     */
    data: XOR<EntityUpdateManyMutationInput, EntityUncheckedUpdateManyInput>
    /**
     * Filter which Entities to update
     */
    where?: EntityWhereInput
    /**
     * Limit how many Entities to update.
     */
    limit?: number
  }

  /**
   * Entity upsert
   */
  export type EntityUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * The filter to search for the Entity to update in case it exists.
     */
    where: EntityWhereUniqueInput
    /**
     * In case the Entity found by the `where` argument doesn't exist, create a new Entity with this data.
     */
    create: XOR<EntityCreateInput, EntityUncheckedCreateInput>
    /**
     * In case the Entity was found with the provided `where` argument, update it with this data.
     */
    update: XOR<EntityUpdateInput, EntityUncheckedUpdateInput>
  }

  /**
   * Entity delete
   */
  export type EntityDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
    /**
     * Filter which Entity to delete.
     */
    where: EntityWhereUniqueInput
  }

  /**
   * Entity deleteMany
   */
  export type EntityDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Entities to delete
     */
    where?: EntityWhereInput
    /**
     * Limit how many Entities to delete.
     */
    limit?: number
  }

  /**
   * Entity.smartSpaceMemberships
   */
  export type Entity$smartSpaceMembershipsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    where?: SmartSpaceMembershipWhereInput
    orderBy?: SmartSpaceMembershipOrderByWithRelationInput | SmartSpaceMembershipOrderByWithRelationInput[]
    cursor?: SmartSpaceMembershipWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SmartSpaceMembershipScalarFieldEnum | SmartSpaceMembershipScalarFieldEnum[]
  }

  /**
   * Entity.messages
   */
  export type Entity$messagesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    where?: SmartSpaceMessageWhereInput
    orderBy?: SmartSpaceMessageOrderByWithRelationInput | SmartSpaceMessageOrderByWithRelationInput[]
    cursor?: SmartSpaceMessageWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SmartSpaceMessageScalarFieldEnum | SmartSpaceMessageScalarFieldEnum[]
  }

  /**
   * Entity.clients
   */
  export type Entity$clientsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    where?: ClientWhereInput
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    cursor?: ClientWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ClientScalarFieldEnum | ClientScalarFieldEnum[]
  }

  /**
   * Entity without action
   */
  export type EntityDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Entity
     */
    select?: EntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Entity
     */
    omit?: EntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EntityInclude<ExtArgs> | null
  }


  /**
   * Model SmartSpace
   */

  export type AggregateSmartSpace = {
    _count: SmartSpaceCountAggregateOutputType | null
    _min: SmartSpaceMinAggregateOutputType | null
    _max: SmartSpaceMaxAggregateOutputType | null
  }

  export type SmartSpaceMinAggregateOutputType = {
    id: string | null
    name: string | null
    description: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SmartSpaceMaxAggregateOutputType = {
    id: string | null
    name: string | null
    description: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SmartSpaceCountAggregateOutputType = {
    id: number
    name: number
    description: number
    metadata: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SmartSpaceMinAggregateInputType = {
    id?: true
    name?: true
    description?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SmartSpaceMaxAggregateInputType = {
    id?: true
    name?: true
    description?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SmartSpaceCountAggregateInputType = {
    id?: true
    name?: true
    description?: true
    metadata?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SmartSpaceAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SmartSpace to aggregate.
     */
    where?: SmartSpaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaces to fetch.
     */
    orderBy?: SmartSpaceOrderByWithRelationInput | SmartSpaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SmartSpaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SmartSpaces
    **/
    _count?: true | SmartSpaceCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SmartSpaceMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SmartSpaceMaxAggregateInputType
  }

  export type GetSmartSpaceAggregateType<T extends SmartSpaceAggregateArgs> = {
        [P in keyof T & keyof AggregateSmartSpace]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSmartSpace[P]>
      : GetScalarType<T[P], AggregateSmartSpace[P]>
  }




  export type SmartSpaceGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SmartSpaceWhereInput
    orderBy?: SmartSpaceOrderByWithAggregationInput | SmartSpaceOrderByWithAggregationInput[]
    by: SmartSpaceScalarFieldEnum[] | SmartSpaceScalarFieldEnum
    having?: SmartSpaceScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SmartSpaceCountAggregateInputType | true
    _min?: SmartSpaceMinAggregateInputType
    _max?: SmartSpaceMaxAggregateInputType
  }

  export type SmartSpaceGroupByOutputType = {
    id: string
    name: string | null
    description: string | null
    metadata: JsonValue | null
    createdAt: Date
    updatedAt: Date
    _count: SmartSpaceCountAggregateOutputType | null
    _min: SmartSpaceMinAggregateOutputType | null
    _max: SmartSpaceMaxAggregateOutputType | null
  }

  type GetSmartSpaceGroupByPayload<T extends SmartSpaceGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SmartSpaceGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SmartSpaceGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SmartSpaceGroupByOutputType[P]>
            : GetScalarType<T[P], SmartSpaceGroupByOutputType[P]>
        }
      >
    >


  export type SmartSpaceSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    description?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    memberships?: boolean | SmartSpace$membershipsArgs<ExtArgs>
    messages?: boolean | SmartSpace$messagesArgs<ExtArgs>
    _count?: boolean | SmartSpaceCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["smartSpace"]>

  export type SmartSpaceSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    description?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["smartSpace"]>

  export type SmartSpaceSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    description?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["smartSpace"]>

  export type SmartSpaceSelectScalar = {
    id?: boolean
    name?: boolean
    description?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SmartSpaceOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "description" | "metadata" | "createdAt" | "updatedAt", ExtArgs["result"]["smartSpace"]>
  export type SmartSpaceInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    memberships?: boolean | SmartSpace$membershipsArgs<ExtArgs>
    messages?: boolean | SmartSpace$messagesArgs<ExtArgs>
    _count?: boolean | SmartSpaceCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SmartSpaceIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SmartSpaceIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SmartSpacePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SmartSpace"
    objects: {
      memberships: Prisma.$SmartSpaceMembershipPayload<ExtArgs>[]
      messages: Prisma.$SmartSpaceMessagePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string | null
      description: string | null
      metadata: Prisma.JsonValue | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["smartSpace"]>
    composites: {}
  }

  type SmartSpaceGetPayload<S extends boolean | null | undefined | SmartSpaceDefaultArgs> = $Result.GetResult<Prisma.$SmartSpacePayload, S>

  type SmartSpaceCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SmartSpaceFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SmartSpaceCountAggregateInputType | true
    }

  export interface SmartSpaceDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SmartSpace'], meta: { name: 'SmartSpace' } }
    /**
     * Find zero or one SmartSpace that matches the filter.
     * @param {SmartSpaceFindUniqueArgs} args - Arguments to find a SmartSpace
     * @example
     * // Get one SmartSpace
     * const smartSpace = await prisma.smartSpace.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SmartSpaceFindUniqueArgs>(args: SelectSubset<T, SmartSpaceFindUniqueArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SmartSpace that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SmartSpaceFindUniqueOrThrowArgs} args - Arguments to find a SmartSpace
     * @example
     * // Get one SmartSpace
     * const smartSpace = await prisma.smartSpace.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SmartSpaceFindUniqueOrThrowArgs>(args: SelectSubset<T, SmartSpaceFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SmartSpace that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceFindFirstArgs} args - Arguments to find a SmartSpace
     * @example
     * // Get one SmartSpace
     * const smartSpace = await prisma.smartSpace.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SmartSpaceFindFirstArgs>(args?: SelectSubset<T, SmartSpaceFindFirstArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SmartSpace that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceFindFirstOrThrowArgs} args - Arguments to find a SmartSpace
     * @example
     * // Get one SmartSpace
     * const smartSpace = await prisma.smartSpace.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SmartSpaceFindFirstOrThrowArgs>(args?: SelectSubset<T, SmartSpaceFindFirstOrThrowArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SmartSpaces that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SmartSpaces
     * const smartSpaces = await prisma.smartSpace.findMany()
     * 
     * // Get first 10 SmartSpaces
     * const smartSpaces = await prisma.smartSpace.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const smartSpaceWithIdOnly = await prisma.smartSpace.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SmartSpaceFindManyArgs>(args?: SelectSubset<T, SmartSpaceFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SmartSpace.
     * @param {SmartSpaceCreateArgs} args - Arguments to create a SmartSpace.
     * @example
     * // Create one SmartSpace
     * const SmartSpace = await prisma.smartSpace.create({
     *   data: {
     *     // ... data to create a SmartSpace
     *   }
     * })
     * 
     */
    create<T extends SmartSpaceCreateArgs>(args: SelectSubset<T, SmartSpaceCreateArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SmartSpaces.
     * @param {SmartSpaceCreateManyArgs} args - Arguments to create many SmartSpaces.
     * @example
     * // Create many SmartSpaces
     * const smartSpace = await prisma.smartSpace.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SmartSpaceCreateManyArgs>(args?: SelectSubset<T, SmartSpaceCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SmartSpaces and returns the data saved in the database.
     * @param {SmartSpaceCreateManyAndReturnArgs} args - Arguments to create many SmartSpaces.
     * @example
     * // Create many SmartSpaces
     * const smartSpace = await prisma.smartSpace.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SmartSpaces and only return the `id`
     * const smartSpaceWithIdOnly = await prisma.smartSpace.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SmartSpaceCreateManyAndReturnArgs>(args?: SelectSubset<T, SmartSpaceCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SmartSpace.
     * @param {SmartSpaceDeleteArgs} args - Arguments to delete one SmartSpace.
     * @example
     * // Delete one SmartSpace
     * const SmartSpace = await prisma.smartSpace.delete({
     *   where: {
     *     // ... filter to delete one SmartSpace
     *   }
     * })
     * 
     */
    delete<T extends SmartSpaceDeleteArgs>(args: SelectSubset<T, SmartSpaceDeleteArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SmartSpace.
     * @param {SmartSpaceUpdateArgs} args - Arguments to update one SmartSpace.
     * @example
     * // Update one SmartSpace
     * const smartSpace = await prisma.smartSpace.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SmartSpaceUpdateArgs>(args: SelectSubset<T, SmartSpaceUpdateArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SmartSpaces.
     * @param {SmartSpaceDeleteManyArgs} args - Arguments to filter SmartSpaces to delete.
     * @example
     * // Delete a few SmartSpaces
     * const { count } = await prisma.smartSpace.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SmartSpaceDeleteManyArgs>(args?: SelectSubset<T, SmartSpaceDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SmartSpaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SmartSpaces
     * const smartSpace = await prisma.smartSpace.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SmartSpaceUpdateManyArgs>(args: SelectSubset<T, SmartSpaceUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SmartSpaces and returns the data updated in the database.
     * @param {SmartSpaceUpdateManyAndReturnArgs} args - Arguments to update many SmartSpaces.
     * @example
     * // Update many SmartSpaces
     * const smartSpace = await prisma.smartSpace.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SmartSpaces and only return the `id`
     * const smartSpaceWithIdOnly = await prisma.smartSpace.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SmartSpaceUpdateManyAndReturnArgs>(args: SelectSubset<T, SmartSpaceUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SmartSpace.
     * @param {SmartSpaceUpsertArgs} args - Arguments to update or create a SmartSpace.
     * @example
     * // Update or create a SmartSpace
     * const smartSpace = await prisma.smartSpace.upsert({
     *   create: {
     *     // ... data to create a SmartSpace
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SmartSpace we want to update
     *   }
     * })
     */
    upsert<T extends SmartSpaceUpsertArgs>(args: SelectSubset<T, SmartSpaceUpsertArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SmartSpaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceCountArgs} args - Arguments to filter SmartSpaces to count.
     * @example
     * // Count the number of SmartSpaces
     * const count = await prisma.smartSpace.count({
     *   where: {
     *     // ... the filter for the SmartSpaces we want to count
     *   }
     * })
    **/
    count<T extends SmartSpaceCountArgs>(
      args?: Subset<T, SmartSpaceCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SmartSpaceCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SmartSpace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SmartSpaceAggregateArgs>(args: Subset<T, SmartSpaceAggregateArgs>): Prisma.PrismaPromise<GetSmartSpaceAggregateType<T>>

    /**
     * Group by SmartSpace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SmartSpaceGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SmartSpaceGroupByArgs['orderBy'] }
        : { orderBy?: SmartSpaceGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SmartSpaceGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSmartSpaceGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SmartSpace model
   */
  readonly fields: SmartSpaceFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SmartSpace.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SmartSpaceClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    memberships<T extends SmartSpace$membershipsArgs<ExtArgs> = {}>(args?: Subset<T, SmartSpace$membershipsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    messages<T extends SmartSpace$messagesArgs<ExtArgs> = {}>(args?: Subset<T, SmartSpace$messagesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SmartSpace model
   */
  interface SmartSpaceFieldRefs {
    readonly id: FieldRef<"SmartSpace", 'String'>
    readonly name: FieldRef<"SmartSpace", 'String'>
    readonly description: FieldRef<"SmartSpace", 'String'>
    readonly metadata: FieldRef<"SmartSpace", 'Json'>
    readonly createdAt: FieldRef<"SmartSpace", 'DateTime'>
    readonly updatedAt: FieldRef<"SmartSpace", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SmartSpace findUnique
   */
  export type SmartSpaceFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpace to fetch.
     */
    where: SmartSpaceWhereUniqueInput
  }

  /**
   * SmartSpace findUniqueOrThrow
   */
  export type SmartSpaceFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpace to fetch.
     */
    where: SmartSpaceWhereUniqueInput
  }

  /**
   * SmartSpace findFirst
   */
  export type SmartSpaceFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpace to fetch.
     */
    where?: SmartSpaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaces to fetch.
     */
    orderBy?: SmartSpaceOrderByWithRelationInput | SmartSpaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SmartSpaces.
     */
    cursor?: SmartSpaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SmartSpaces.
     */
    distinct?: SmartSpaceScalarFieldEnum | SmartSpaceScalarFieldEnum[]
  }

  /**
   * SmartSpace findFirstOrThrow
   */
  export type SmartSpaceFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpace to fetch.
     */
    where?: SmartSpaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaces to fetch.
     */
    orderBy?: SmartSpaceOrderByWithRelationInput | SmartSpaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SmartSpaces.
     */
    cursor?: SmartSpaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SmartSpaces.
     */
    distinct?: SmartSpaceScalarFieldEnum | SmartSpaceScalarFieldEnum[]
  }

  /**
   * SmartSpace findMany
   */
  export type SmartSpaceFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaces to fetch.
     */
    where?: SmartSpaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaces to fetch.
     */
    orderBy?: SmartSpaceOrderByWithRelationInput | SmartSpaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SmartSpaces.
     */
    cursor?: SmartSpaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaces.
     */
    skip?: number
    distinct?: SmartSpaceScalarFieldEnum | SmartSpaceScalarFieldEnum[]
  }

  /**
   * SmartSpace create
   */
  export type SmartSpaceCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * The data needed to create a SmartSpace.
     */
    data: XOR<SmartSpaceCreateInput, SmartSpaceUncheckedCreateInput>
  }

  /**
   * SmartSpace createMany
   */
  export type SmartSpaceCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SmartSpaces.
     */
    data: SmartSpaceCreateManyInput | SmartSpaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SmartSpace createManyAndReturn
   */
  export type SmartSpaceCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * The data used to create many SmartSpaces.
     */
    data: SmartSpaceCreateManyInput | SmartSpaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SmartSpace update
   */
  export type SmartSpaceUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * The data needed to update a SmartSpace.
     */
    data: XOR<SmartSpaceUpdateInput, SmartSpaceUncheckedUpdateInput>
    /**
     * Choose, which SmartSpace to update.
     */
    where: SmartSpaceWhereUniqueInput
  }

  /**
   * SmartSpace updateMany
   */
  export type SmartSpaceUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SmartSpaces.
     */
    data: XOR<SmartSpaceUpdateManyMutationInput, SmartSpaceUncheckedUpdateManyInput>
    /**
     * Filter which SmartSpaces to update
     */
    where?: SmartSpaceWhereInput
    /**
     * Limit how many SmartSpaces to update.
     */
    limit?: number
  }

  /**
   * SmartSpace updateManyAndReturn
   */
  export type SmartSpaceUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * The data used to update SmartSpaces.
     */
    data: XOR<SmartSpaceUpdateManyMutationInput, SmartSpaceUncheckedUpdateManyInput>
    /**
     * Filter which SmartSpaces to update
     */
    where?: SmartSpaceWhereInput
    /**
     * Limit how many SmartSpaces to update.
     */
    limit?: number
  }

  /**
   * SmartSpace upsert
   */
  export type SmartSpaceUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * The filter to search for the SmartSpace to update in case it exists.
     */
    where: SmartSpaceWhereUniqueInput
    /**
     * In case the SmartSpace found by the `where` argument doesn't exist, create a new SmartSpace with this data.
     */
    create: XOR<SmartSpaceCreateInput, SmartSpaceUncheckedCreateInput>
    /**
     * In case the SmartSpace was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SmartSpaceUpdateInput, SmartSpaceUncheckedUpdateInput>
  }

  /**
   * SmartSpace delete
   */
  export type SmartSpaceDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
    /**
     * Filter which SmartSpace to delete.
     */
    where: SmartSpaceWhereUniqueInput
  }

  /**
   * SmartSpace deleteMany
   */
  export type SmartSpaceDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SmartSpaces to delete
     */
    where?: SmartSpaceWhereInput
    /**
     * Limit how many SmartSpaces to delete.
     */
    limit?: number
  }

  /**
   * SmartSpace.memberships
   */
  export type SmartSpace$membershipsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    where?: SmartSpaceMembershipWhereInput
    orderBy?: SmartSpaceMembershipOrderByWithRelationInput | SmartSpaceMembershipOrderByWithRelationInput[]
    cursor?: SmartSpaceMembershipWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SmartSpaceMembershipScalarFieldEnum | SmartSpaceMembershipScalarFieldEnum[]
  }

  /**
   * SmartSpace.messages
   */
  export type SmartSpace$messagesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    where?: SmartSpaceMessageWhereInput
    orderBy?: SmartSpaceMessageOrderByWithRelationInput | SmartSpaceMessageOrderByWithRelationInput[]
    cursor?: SmartSpaceMessageWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SmartSpaceMessageScalarFieldEnum | SmartSpaceMessageScalarFieldEnum[]
  }

  /**
   * SmartSpace without action
   */
  export type SmartSpaceDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpace
     */
    select?: SmartSpaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpace
     */
    omit?: SmartSpaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceInclude<ExtArgs> | null
  }


  /**
   * Model SmartSpaceMembership
   */

  export type AggregateSmartSpaceMembership = {
    _count: SmartSpaceMembershipCountAggregateOutputType | null
    _min: SmartSpaceMembershipMinAggregateOutputType | null
    _max: SmartSpaceMembershipMaxAggregateOutputType | null
  }

  export type SmartSpaceMembershipMinAggregateOutputType = {
    id: string | null
    smartSpaceId: string | null
    entityId: string | null
    role: string | null
    joinedAt: Date | null
    lastSeenMessageId: string | null
  }

  export type SmartSpaceMembershipMaxAggregateOutputType = {
    id: string | null
    smartSpaceId: string | null
    entityId: string | null
    role: string | null
    joinedAt: Date | null
    lastSeenMessageId: string | null
  }

  export type SmartSpaceMembershipCountAggregateOutputType = {
    id: number
    smartSpaceId: number
    entityId: number
    role: number
    joinedAt: number
    lastSeenMessageId: number
    _all: number
  }


  export type SmartSpaceMembershipMinAggregateInputType = {
    id?: true
    smartSpaceId?: true
    entityId?: true
    role?: true
    joinedAt?: true
    lastSeenMessageId?: true
  }

  export type SmartSpaceMembershipMaxAggregateInputType = {
    id?: true
    smartSpaceId?: true
    entityId?: true
    role?: true
    joinedAt?: true
    lastSeenMessageId?: true
  }

  export type SmartSpaceMembershipCountAggregateInputType = {
    id?: true
    smartSpaceId?: true
    entityId?: true
    role?: true
    joinedAt?: true
    lastSeenMessageId?: true
    _all?: true
  }

  export type SmartSpaceMembershipAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SmartSpaceMembership to aggregate.
     */
    where?: SmartSpaceMembershipWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMemberships to fetch.
     */
    orderBy?: SmartSpaceMembershipOrderByWithRelationInput | SmartSpaceMembershipOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SmartSpaceMembershipWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMemberships from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMemberships.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SmartSpaceMemberships
    **/
    _count?: true | SmartSpaceMembershipCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SmartSpaceMembershipMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SmartSpaceMembershipMaxAggregateInputType
  }

  export type GetSmartSpaceMembershipAggregateType<T extends SmartSpaceMembershipAggregateArgs> = {
        [P in keyof T & keyof AggregateSmartSpaceMembership]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSmartSpaceMembership[P]>
      : GetScalarType<T[P], AggregateSmartSpaceMembership[P]>
  }




  export type SmartSpaceMembershipGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SmartSpaceMembershipWhereInput
    orderBy?: SmartSpaceMembershipOrderByWithAggregationInput | SmartSpaceMembershipOrderByWithAggregationInput[]
    by: SmartSpaceMembershipScalarFieldEnum[] | SmartSpaceMembershipScalarFieldEnum
    having?: SmartSpaceMembershipScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SmartSpaceMembershipCountAggregateInputType | true
    _min?: SmartSpaceMembershipMinAggregateInputType
    _max?: SmartSpaceMembershipMaxAggregateInputType
  }

  export type SmartSpaceMembershipGroupByOutputType = {
    id: string
    smartSpaceId: string
    entityId: string
    role: string | null
    joinedAt: Date
    lastSeenMessageId: string | null
    _count: SmartSpaceMembershipCountAggregateOutputType | null
    _min: SmartSpaceMembershipMinAggregateOutputType | null
    _max: SmartSpaceMembershipMaxAggregateOutputType | null
  }

  type GetSmartSpaceMembershipGroupByPayload<T extends SmartSpaceMembershipGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SmartSpaceMembershipGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SmartSpaceMembershipGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SmartSpaceMembershipGroupByOutputType[P]>
            : GetScalarType<T[P], SmartSpaceMembershipGroupByOutputType[P]>
        }
      >
    >


  export type SmartSpaceMembershipSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    joinedAt?: boolean
    lastSeenMessageId?: boolean
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["smartSpaceMembership"]>

  export type SmartSpaceMembershipSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    joinedAt?: boolean
    lastSeenMessageId?: boolean
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["smartSpaceMembership"]>

  export type SmartSpaceMembershipSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    joinedAt?: boolean
    lastSeenMessageId?: boolean
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["smartSpaceMembership"]>

  export type SmartSpaceMembershipSelectScalar = {
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    joinedAt?: boolean
    lastSeenMessageId?: boolean
  }

  export type SmartSpaceMembershipOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "smartSpaceId" | "entityId" | "role" | "joinedAt" | "lastSeenMessageId", ExtArgs["result"]["smartSpaceMembership"]>
  export type SmartSpaceMembershipInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }
  export type SmartSpaceMembershipIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }
  export type SmartSpaceMembershipIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }

  export type $SmartSpaceMembershipPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SmartSpaceMembership"
    objects: {
      smartSpace: Prisma.$SmartSpacePayload<ExtArgs>
      entity: Prisma.$EntityPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      smartSpaceId: string
      entityId: string
      role: string | null
      joinedAt: Date
      lastSeenMessageId: string | null
    }, ExtArgs["result"]["smartSpaceMembership"]>
    composites: {}
  }

  type SmartSpaceMembershipGetPayload<S extends boolean | null | undefined | SmartSpaceMembershipDefaultArgs> = $Result.GetResult<Prisma.$SmartSpaceMembershipPayload, S>

  type SmartSpaceMembershipCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SmartSpaceMembershipFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SmartSpaceMembershipCountAggregateInputType | true
    }

  export interface SmartSpaceMembershipDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SmartSpaceMembership'], meta: { name: 'SmartSpaceMembership' } }
    /**
     * Find zero or one SmartSpaceMembership that matches the filter.
     * @param {SmartSpaceMembershipFindUniqueArgs} args - Arguments to find a SmartSpaceMembership
     * @example
     * // Get one SmartSpaceMembership
     * const smartSpaceMembership = await prisma.smartSpaceMembership.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SmartSpaceMembershipFindUniqueArgs>(args: SelectSubset<T, SmartSpaceMembershipFindUniqueArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SmartSpaceMembership that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SmartSpaceMembershipFindUniqueOrThrowArgs} args - Arguments to find a SmartSpaceMembership
     * @example
     * // Get one SmartSpaceMembership
     * const smartSpaceMembership = await prisma.smartSpaceMembership.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SmartSpaceMembershipFindUniqueOrThrowArgs>(args: SelectSubset<T, SmartSpaceMembershipFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SmartSpaceMembership that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMembershipFindFirstArgs} args - Arguments to find a SmartSpaceMembership
     * @example
     * // Get one SmartSpaceMembership
     * const smartSpaceMembership = await prisma.smartSpaceMembership.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SmartSpaceMembershipFindFirstArgs>(args?: SelectSubset<T, SmartSpaceMembershipFindFirstArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SmartSpaceMembership that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMembershipFindFirstOrThrowArgs} args - Arguments to find a SmartSpaceMembership
     * @example
     * // Get one SmartSpaceMembership
     * const smartSpaceMembership = await prisma.smartSpaceMembership.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SmartSpaceMembershipFindFirstOrThrowArgs>(args?: SelectSubset<T, SmartSpaceMembershipFindFirstOrThrowArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SmartSpaceMemberships that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMembershipFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SmartSpaceMemberships
     * const smartSpaceMemberships = await prisma.smartSpaceMembership.findMany()
     * 
     * // Get first 10 SmartSpaceMemberships
     * const smartSpaceMemberships = await prisma.smartSpaceMembership.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const smartSpaceMembershipWithIdOnly = await prisma.smartSpaceMembership.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SmartSpaceMembershipFindManyArgs>(args?: SelectSubset<T, SmartSpaceMembershipFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SmartSpaceMembership.
     * @param {SmartSpaceMembershipCreateArgs} args - Arguments to create a SmartSpaceMembership.
     * @example
     * // Create one SmartSpaceMembership
     * const SmartSpaceMembership = await prisma.smartSpaceMembership.create({
     *   data: {
     *     // ... data to create a SmartSpaceMembership
     *   }
     * })
     * 
     */
    create<T extends SmartSpaceMembershipCreateArgs>(args: SelectSubset<T, SmartSpaceMembershipCreateArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SmartSpaceMemberships.
     * @param {SmartSpaceMembershipCreateManyArgs} args - Arguments to create many SmartSpaceMemberships.
     * @example
     * // Create many SmartSpaceMemberships
     * const smartSpaceMembership = await prisma.smartSpaceMembership.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SmartSpaceMembershipCreateManyArgs>(args?: SelectSubset<T, SmartSpaceMembershipCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SmartSpaceMemberships and returns the data saved in the database.
     * @param {SmartSpaceMembershipCreateManyAndReturnArgs} args - Arguments to create many SmartSpaceMemberships.
     * @example
     * // Create many SmartSpaceMemberships
     * const smartSpaceMembership = await prisma.smartSpaceMembership.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SmartSpaceMemberships and only return the `id`
     * const smartSpaceMembershipWithIdOnly = await prisma.smartSpaceMembership.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SmartSpaceMembershipCreateManyAndReturnArgs>(args?: SelectSubset<T, SmartSpaceMembershipCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SmartSpaceMembership.
     * @param {SmartSpaceMembershipDeleteArgs} args - Arguments to delete one SmartSpaceMembership.
     * @example
     * // Delete one SmartSpaceMembership
     * const SmartSpaceMembership = await prisma.smartSpaceMembership.delete({
     *   where: {
     *     // ... filter to delete one SmartSpaceMembership
     *   }
     * })
     * 
     */
    delete<T extends SmartSpaceMembershipDeleteArgs>(args: SelectSubset<T, SmartSpaceMembershipDeleteArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SmartSpaceMembership.
     * @param {SmartSpaceMembershipUpdateArgs} args - Arguments to update one SmartSpaceMembership.
     * @example
     * // Update one SmartSpaceMembership
     * const smartSpaceMembership = await prisma.smartSpaceMembership.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SmartSpaceMembershipUpdateArgs>(args: SelectSubset<T, SmartSpaceMembershipUpdateArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SmartSpaceMemberships.
     * @param {SmartSpaceMembershipDeleteManyArgs} args - Arguments to filter SmartSpaceMemberships to delete.
     * @example
     * // Delete a few SmartSpaceMemberships
     * const { count } = await prisma.smartSpaceMembership.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SmartSpaceMembershipDeleteManyArgs>(args?: SelectSubset<T, SmartSpaceMembershipDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SmartSpaceMemberships.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMembershipUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SmartSpaceMemberships
     * const smartSpaceMembership = await prisma.smartSpaceMembership.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SmartSpaceMembershipUpdateManyArgs>(args: SelectSubset<T, SmartSpaceMembershipUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SmartSpaceMemberships and returns the data updated in the database.
     * @param {SmartSpaceMembershipUpdateManyAndReturnArgs} args - Arguments to update many SmartSpaceMemberships.
     * @example
     * // Update many SmartSpaceMemberships
     * const smartSpaceMembership = await prisma.smartSpaceMembership.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SmartSpaceMemberships and only return the `id`
     * const smartSpaceMembershipWithIdOnly = await prisma.smartSpaceMembership.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SmartSpaceMembershipUpdateManyAndReturnArgs>(args: SelectSubset<T, SmartSpaceMembershipUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SmartSpaceMembership.
     * @param {SmartSpaceMembershipUpsertArgs} args - Arguments to update or create a SmartSpaceMembership.
     * @example
     * // Update or create a SmartSpaceMembership
     * const smartSpaceMembership = await prisma.smartSpaceMembership.upsert({
     *   create: {
     *     // ... data to create a SmartSpaceMembership
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SmartSpaceMembership we want to update
     *   }
     * })
     */
    upsert<T extends SmartSpaceMembershipUpsertArgs>(args: SelectSubset<T, SmartSpaceMembershipUpsertArgs<ExtArgs>>): Prisma__SmartSpaceMembershipClient<$Result.GetResult<Prisma.$SmartSpaceMembershipPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SmartSpaceMemberships.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMembershipCountArgs} args - Arguments to filter SmartSpaceMemberships to count.
     * @example
     * // Count the number of SmartSpaceMemberships
     * const count = await prisma.smartSpaceMembership.count({
     *   where: {
     *     // ... the filter for the SmartSpaceMemberships we want to count
     *   }
     * })
    **/
    count<T extends SmartSpaceMembershipCountArgs>(
      args?: Subset<T, SmartSpaceMembershipCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SmartSpaceMembershipCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SmartSpaceMembership.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMembershipAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SmartSpaceMembershipAggregateArgs>(args: Subset<T, SmartSpaceMembershipAggregateArgs>): Prisma.PrismaPromise<GetSmartSpaceMembershipAggregateType<T>>

    /**
     * Group by SmartSpaceMembership.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMembershipGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SmartSpaceMembershipGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SmartSpaceMembershipGroupByArgs['orderBy'] }
        : { orderBy?: SmartSpaceMembershipGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SmartSpaceMembershipGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSmartSpaceMembershipGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SmartSpaceMembership model
   */
  readonly fields: SmartSpaceMembershipFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SmartSpaceMembership.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SmartSpaceMembershipClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    smartSpace<T extends SmartSpaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SmartSpaceDefaultArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    entity<T extends EntityDefaultArgs<ExtArgs> = {}>(args?: Subset<T, EntityDefaultArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SmartSpaceMembership model
   */
  interface SmartSpaceMembershipFieldRefs {
    readonly id: FieldRef<"SmartSpaceMembership", 'String'>
    readonly smartSpaceId: FieldRef<"SmartSpaceMembership", 'String'>
    readonly entityId: FieldRef<"SmartSpaceMembership", 'String'>
    readonly role: FieldRef<"SmartSpaceMembership", 'String'>
    readonly joinedAt: FieldRef<"SmartSpaceMembership", 'DateTime'>
    readonly lastSeenMessageId: FieldRef<"SmartSpaceMembership", 'String'>
  }
    

  // Custom InputTypes
  /**
   * SmartSpaceMembership findUnique
   */
  export type SmartSpaceMembershipFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMembership to fetch.
     */
    where: SmartSpaceMembershipWhereUniqueInput
  }

  /**
   * SmartSpaceMembership findUniqueOrThrow
   */
  export type SmartSpaceMembershipFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMembership to fetch.
     */
    where: SmartSpaceMembershipWhereUniqueInput
  }

  /**
   * SmartSpaceMembership findFirst
   */
  export type SmartSpaceMembershipFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMembership to fetch.
     */
    where?: SmartSpaceMembershipWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMemberships to fetch.
     */
    orderBy?: SmartSpaceMembershipOrderByWithRelationInput | SmartSpaceMembershipOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SmartSpaceMemberships.
     */
    cursor?: SmartSpaceMembershipWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMemberships from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMemberships.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SmartSpaceMemberships.
     */
    distinct?: SmartSpaceMembershipScalarFieldEnum | SmartSpaceMembershipScalarFieldEnum[]
  }

  /**
   * SmartSpaceMembership findFirstOrThrow
   */
  export type SmartSpaceMembershipFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMembership to fetch.
     */
    where?: SmartSpaceMembershipWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMemberships to fetch.
     */
    orderBy?: SmartSpaceMembershipOrderByWithRelationInput | SmartSpaceMembershipOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SmartSpaceMemberships.
     */
    cursor?: SmartSpaceMembershipWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMemberships from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMemberships.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SmartSpaceMemberships.
     */
    distinct?: SmartSpaceMembershipScalarFieldEnum | SmartSpaceMembershipScalarFieldEnum[]
  }

  /**
   * SmartSpaceMembership findMany
   */
  export type SmartSpaceMembershipFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMemberships to fetch.
     */
    where?: SmartSpaceMembershipWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMemberships to fetch.
     */
    orderBy?: SmartSpaceMembershipOrderByWithRelationInput | SmartSpaceMembershipOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SmartSpaceMemberships.
     */
    cursor?: SmartSpaceMembershipWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMemberships from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMemberships.
     */
    skip?: number
    distinct?: SmartSpaceMembershipScalarFieldEnum | SmartSpaceMembershipScalarFieldEnum[]
  }

  /**
   * SmartSpaceMembership create
   */
  export type SmartSpaceMembershipCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * The data needed to create a SmartSpaceMembership.
     */
    data: XOR<SmartSpaceMembershipCreateInput, SmartSpaceMembershipUncheckedCreateInput>
  }

  /**
   * SmartSpaceMembership createMany
   */
  export type SmartSpaceMembershipCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SmartSpaceMemberships.
     */
    data: SmartSpaceMembershipCreateManyInput | SmartSpaceMembershipCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SmartSpaceMembership createManyAndReturn
   */
  export type SmartSpaceMembershipCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * The data used to create many SmartSpaceMemberships.
     */
    data: SmartSpaceMembershipCreateManyInput | SmartSpaceMembershipCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SmartSpaceMembership update
   */
  export type SmartSpaceMembershipUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * The data needed to update a SmartSpaceMembership.
     */
    data: XOR<SmartSpaceMembershipUpdateInput, SmartSpaceMembershipUncheckedUpdateInput>
    /**
     * Choose, which SmartSpaceMembership to update.
     */
    where: SmartSpaceMembershipWhereUniqueInput
  }

  /**
   * SmartSpaceMembership updateMany
   */
  export type SmartSpaceMembershipUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SmartSpaceMemberships.
     */
    data: XOR<SmartSpaceMembershipUpdateManyMutationInput, SmartSpaceMembershipUncheckedUpdateManyInput>
    /**
     * Filter which SmartSpaceMemberships to update
     */
    where?: SmartSpaceMembershipWhereInput
    /**
     * Limit how many SmartSpaceMemberships to update.
     */
    limit?: number
  }

  /**
   * SmartSpaceMembership updateManyAndReturn
   */
  export type SmartSpaceMembershipUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * The data used to update SmartSpaceMemberships.
     */
    data: XOR<SmartSpaceMembershipUpdateManyMutationInput, SmartSpaceMembershipUncheckedUpdateManyInput>
    /**
     * Filter which SmartSpaceMemberships to update
     */
    where?: SmartSpaceMembershipWhereInput
    /**
     * Limit how many SmartSpaceMemberships to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SmartSpaceMembership upsert
   */
  export type SmartSpaceMembershipUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * The filter to search for the SmartSpaceMembership to update in case it exists.
     */
    where: SmartSpaceMembershipWhereUniqueInput
    /**
     * In case the SmartSpaceMembership found by the `where` argument doesn't exist, create a new SmartSpaceMembership with this data.
     */
    create: XOR<SmartSpaceMembershipCreateInput, SmartSpaceMembershipUncheckedCreateInput>
    /**
     * In case the SmartSpaceMembership was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SmartSpaceMembershipUpdateInput, SmartSpaceMembershipUncheckedUpdateInput>
  }

  /**
   * SmartSpaceMembership delete
   */
  export type SmartSpaceMembershipDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
    /**
     * Filter which SmartSpaceMembership to delete.
     */
    where: SmartSpaceMembershipWhereUniqueInput
  }

  /**
   * SmartSpaceMembership deleteMany
   */
  export type SmartSpaceMembershipDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SmartSpaceMemberships to delete
     */
    where?: SmartSpaceMembershipWhereInput
    /**
     * Limit how many SmartSpaceMemberships to delete.
     */
    limit?: number
  }

  /**
   * SmartSpaceMembership without action
   */
  export type SmartSpaceMembershipDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMembership
     */
    select?: SmartSpaceMembershipSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMembership
     */
    omit?: SmartSpaceMembershipOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMembershipInclude<ExtArgs> | null
  }


  /**
   * Model SmartSpaceMessage
   */

  export type AggregateSmartSpaceMessage = {
    _count: SmartSpaceMessageCountAggregateOutputType | null
    _avg: SmartSpaceMessageAvgAggregateOutputType | null
    _sum: SmartSpaceMessageSumAggregateOutputType | null
    _min: SmartSpaceMessageMinAggregateOutputType | null
    _max: SmartSpaceMessageMaxAggregateOutputType | null
  }

  export type SmartSpaceMessageAvgAggregateOutputType = {
    seq: number | null
  }

  export type SmartSpaceMessageSumAggregateOutputType = {
    seq: bigint | null
  }

  export type SmartSpaceMessageMinAggregateOutputType = {
    id: string | null
    smartSpaceId: string | null
    entityId: string | null
    role: string | null
    content: string | null
    seq: bigint | null
    createdAt: Date | null
  }

  export type SmartSpaceMessageMaxAggregateOutputType = {
    id: string | null
    smartSpaceId: string | null
    entityId: string | null
    role: string | null
    content: string | null
    seq: bigint | null
    createdAt: Date | null
  }

  export type SmartSpaceMessageCountAggregateOutputType = {
    id: number
    smartSpaceId: number
    entityId: number
    role: number
    content: number
    metadata: number
    seq: number
    createdAt: number
    _all: number
  }


  export type SmartSpaceMessageAvgAggregateInputType = {
    seq?: true
  }

  export type SmartSpaceMessageSumAggregateInputType = {
    seq?: true
  }

  export type SmartSpaceMessageMinAggregateInputType = {
    id?: true
    smartSpaceId?: true
    entityId?: true
    role?: true
    content?: true
    seq?: true
    createdAt?: true
  }

  export type SmartSpaceMessageMaxAggregateInputType = {
    id?: true
    smartSpaceId?: true
    entityId?: true
    role?: true
    content?: true
    seq?: true
    createdAt?: true
  }

  export type SmartSpaceMessageCountAggregateInputType = {
    id?: true
    smartSpaceId?: true
    entityId?: true
    role?: true
    content?: true
    metadata?: true
    seq?: true
    createdAt?: true
    _all?: true
  }

  export type SmartSpaceMessageAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SmartSpaceMessage to aggregate.
     */
    where?: SmartSpaceMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMessages to fetch.
     */
    orderBy?: SmartSpaceMessageOrderByWithRelationInput | SmartSpaceMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SmartSpaceMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMessages.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SmartSpaceMessages
    **/
    _count?: true | SmartSpaceMessageCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SmartSpaceMessageAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SmartSpaceMessageSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SmartSpaceMessageMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SmartSpaceMessageMaxAggregateInputType
  }

  export type GetSmartSpaceMessageAggregateType<T extends SmartSpaceMessageAggregateArgs> = {
        [P in keyof T & keyof AggregateSmartSpaceMessage]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSmartSpaceMessage[P]>
      : GetScalarType<T[P], AggregateSmartSpaceMessage[P]>
  }




  export type SmartSpaceMessageGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SmartSpaceMessageWhereInput
    orderBy?: SmartSpaceMessageOrderByWithAggregationInput | SmartSpaceMessageOrderByWithAggregationInput[]
    by: SmartSpaceMessageScalarFieldEnum[] | SmartSpaceMessageScalarFieldEnum
    having?: SmartSpaceMessageScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SmartSpaceMessageCountAggregateInputType | true
    _avg?: SmartSpaceMessageAvgAggregateInputType
    _sum?: SmartSpaceMessageSumAggregateInputType
    _min?: SmartSpaceMessageMinAggregateInputType
    _max?: SmartSpaceMessageMaxAggregateInputType
  }

  export type SmartSpaceMessageGroupByOutputType = {
    id: string
    smartSpaceId: string
    entityId: string
    role: string
    content: string | null
    metadata: JsonValue | null
    seq: bigint
    createdAt: Date
    _count: SmartSpaceMessageCountAggregateOutputType | null
    _avg: SmartSpaceMessageAvgAggregateOutputType | null
    _sum: SmartSpaceMessageSumAggregateOutputType | null
    _min: SmartSpaceMessageMinAggregateOutputType | null
    _max: SmartSpaceMessageMaxAggregateOutputType | null
  }

  type GetSmartSpaceMessageGroupByPayload<T extends SmartSpaceMessageGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SmartSpaceMessageGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SmartSpaceMessageGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SmartSpaceMessageGroupByOutputType[P]>
            : GetScalarType<T[P], SmartSpaceMessageGroupByOutputType[P]>
        }
      >
    >


  export type SmartSpaceMessageSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    content?: boolean
    metadata?: boolean
    seq?: boolean
    createdAt?: boolean
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["smartSpaceMessage"]>

  export type SmartSpaceMessageSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    content?: boolean
    metadata?: boolean
    seq?: boolean
    createdAt?: boolean
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["smartSpaceMessage"]>

  export type SmartSpaceMessageSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    content?: boolean
    metadata?: boolean
    seq?: boolean
    createdAt?: boolean
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["smartSpaceMessage"]>

  export type SmartSpaceMessageSelectScalar = {
    id?: boolean
    smartSpaceId?: boolean
    entityId?: boolean
    role?: boolean
    content?: boolean
    metadata?: boolean
    seq?: boolean
    createdAt?: boolean
  }

  export type SmartSpaceMessageOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "smartSpaceId" | "entityId" | "role" | "content" | "metadata" | "seq" | "createdAt", ExtArgs["result"]["smartSpaceMessage"]>
  export type SmartSpaceMessageInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }
  export type SmartSpaceMessageIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }
  export type SmartSpaceMessageIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    smartSpace?: boolean | SmartSpaceDefaultArgs<ExtArgs>
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }

  export type $SmartSpaceMessagePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SmartSpaceMessage"
    objects: {
      smartSpace: Prisma.$SmartSpacePayload<ExtArgs>
      entity: Prisma.$EntityPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      smartSpaceId: string
      entityId: string
      role: string
      content: string | null
      metadata: Prisma.JsonValue | null
      seq: bigint
      createdAt: Date
    }, ExtArgs["result"]["smartSpaceMessage"]>
    composites: {}
  }

  type SmartSpaceMessageGetPayload<S extends boolean | null | undefined | SmartSpaceMessageDefaultArgs> = $Result.GetResult<Prisma.$SmartSpaceMessagePayload, S>

  type SmartSpaceMessageCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SmartSpaceMessageFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SmartSpaceMessageCountAggregateInputType | true
    }

  export interface SmartSpaceMessageDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SmartSpaceMessage'], meta: { name: 'SmartSpaceMessage' } }
    /**
     * Find zero or one SmartSpaceMessage that matches the filter.
     * @param {SmartSpaceMessageFindUniqueArgs} args - Arguments to find a SmartSpaceMessage
     * @example
     * // Get one SmartSpaceMessage
     * const smartSpaceMessage = await prisma.smartSpaceMessage.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SmartSpaceMessageFindUniqueArgs>(args: SelectSubset<T, SmartSpaceMessageFindUniqueArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SmartSpaceMessage that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SmartSpaceMessageFindUniqueOrThrowArgs} args - Arguments to find a SmartSpaceMessage
     * @example
     * // Get one SmartSpaceMessage
     * const smartSpaceMessage = await prisma.smartSpaceMessage.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SmartSpaceMessageFindUniqueOrThrowArgs>(args: SelectSubset<T, SmartSpaceMessageFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SmartSpaceMessage that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMessageFindFirstArgs} args - Arguments to find a SmartSpaceMessage
     * @example
     * // Get one SmartSpaceMessage
     * const smartSpaceMessage = await prisma.smartSpaceMessage.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SmartSpaceMessageFindFirstArgs>(args?: SelectSubset<T, SmartSpaceMessageFindFirstArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SmartSpaceMessage that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMessageFindFirstOrThrowArgs} args - Arguments to find a SmartSpaceMessage
     * @example
     * // Get one SmartSpaceMessage
     * const smartSpaceMessage = await prisma.smartSpaceMessage.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SmartSpaceMessageFindFirstOrThrowArgs>(args?: SelectSubset<T, SmartSpaceMessageFindFirstOrThrowArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SmartSpaceMessages that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMessageFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SmartSpaceMessages
     * const smartSpaceMessages = await prisma.smartSpaceMessage.findMany()
     * 
     * // Get first 10 SmartSpaceMessages
     * const smartSpaceMessages = await prisma.smartSpaceMessage.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const smartSpaceMessageWithIdOnly = await prisma.smartSpaceMessage.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SmartSpaceMessageFindManyArgs>(args?: SelectSubset<T, SmartSpaceMessageFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SmartSpaceMessage.
     * @param {SmartSpaceMessageCreateArgs} args - Arguments to create a SmartSpaceMessage.
     * @example
     * // Create one SmartSpaceMessage
     * const SmartSpaceMessage = await prisma.smartSpaceMessage.create({
     *   data: {
     *     // ... data to create a SmartSpaceMessage
     *   }
     * })
     * 
     */
    create<T extends SmartSpaceMessageCreateArgs>(args: SelectSubset<T, SmartSpaceMessageCreateArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SmartSpaceMessages.
     * @param {SmartSpaceMessageCreateManyArgs} args - Arguments to create many SmartSpaceMessages.
     * @example
     * // Create many SmartSpaceMessages
     * const smartSpaceMessage = await prisma.smartSpaceMessage.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SmartSpaceMessageCreateManyArgs>(args?: SelectSubset<T, SmartSpaceMessageCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SmartSpaceMessages and returns the data saved in the database.
     * @param {SmartSpaceMessageCreateManyAndReturnArgs} args - Arguments to create many SmartSpaceMessages.
     * @example
     * // Create many SmartSpaceMessages
     * const smartSpaceMessage = await prisma.smartSpaceMessage.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SmartSpaceMessages and only return the `id`
     * const smartSpaceMessageWithIdOnly = await prisma.smartSpaceMessage.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SmartSpaceMessageCreateManyAndReturnArgs>(args?: SelectSubset<T, SmartSpaceMessageCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SmartSpaceMessage.
     * @param {SmartSpaceMessageDeleteArgs} args - Arguments to delete one SmartSpaceMessage.
     * @example
     * // Delete one SmartSpaceMessage
     * const SmartSpaceMessage = await prisma.smartSpaceMessage.delete({
     *   where: {
     *     // ... filter to delete one SmartSpaceMessage
     *   }
     * })
     * 
     */
    delete<T extends SmartSpaceMessageDeleteArgs>(args: SelectSubset<T, SmartSpaceMessageDeleteArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SmartSpaceMessage.
     * @param {SmartSpaceMessageUpdateArgs} args - Arguments to update one SmartSpaceMessage.
     * @example
     * // Update one SmartSpaceMessage
     * const smartSpaceMessage = await prisma.smartSpaceMessage.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SmartSpaceMessageUpdateArgs>(args: SelectSubset<T, SmartSpaceMessageUpdateArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SmartSpaceMessages.
     * @param {SmartSpaceMessageDeleteManyArgs} args - Arguments to filter SmartSpaceMessages to delete.
     * @example
     * // Delete a few SmartSpaceMessages
     * const { count } = await prisma.smartSpaceMessage.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SmartSpaceMessageDeleteManyArgs>(args?: SelectSubset<T, SmartSpaceMessageDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SmartSpaceMessages.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMessageUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SmartSpaceMessages
     * const smartSpaceMessage = await prisma.smartSpaceMessage.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SmartSpaceMessageUpdateManyArgs>(args: SelectSubset<T, SmartSpaceMessageUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SmartSpaceMessages and returns the data updated in the database.
     * @param {SmartSpaceMessageUpdateManyAndReturnArgs} args - Arguments to update many SmartSpaceMessages.
     * @example
     * // Update many SmartSpaceMessages
     * const smartSpaceMessage = await prisma.smartSpaceMessage.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SmartSpaceMessages and only return the `id`
     * const smartSpaceMessageWithIdOnly = await prisma.smartSpaceMessage.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SmartSpaceMessageUpdateManyAndReturnArgs>(args: SelectSubset<T, SmartSpaceMessageUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SmartSpaceMessage.
     * @param {SmartSpaceMessageUpsertArgs} args - Arguments to update or create a SmartSpaceMessage.
     * @example
     * // Update or create a SmartSpaceMessage
     * const smartSpaceMessage = await prisma.smartSpaceMessage.upsert({
     *   create: {
     *     // ... data to create a SmartSpaceMessage
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SmartSpaceMessage we want to update
     *   }
     * })
     */
    upsert<T extends SmartSpaceMessageUpsertArgs>(args: SelectSubset<T, SmartSpaceMessageUpsertArgs<ExtArgs>>): Prisma__SmartSpaceMessageClient<$Result.GetResult<Prisma.$SmartSpaceMessagePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SmartSpaceMessages.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMessageCountArgs} args - Arguments to filter SmartSpaceMessages to count.
     * @example
     * // Count the number of SmartSpaceMessages
     * const count = await prisma.smartSpaceMessage.count({
     *   where: {
     *     // ... the filter for the SmartSpaceMessages we want to count
     *   }
     * })
    **/
    count<T extends SmartSpaceMessageCountArgs>(
      args?: Subset<T, SmartSpaceMessageCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SmartSpaceMessageCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SmartSpaceMessage.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMessageAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SmartSpaceMessageAggregateArgs>(args: Subset<T, SmartSpaceMessageAggregateArgs>): Prisma.PrismaPromise<GetSmartSpaceMessageAggregateType<T>>

    /**
     * Group by SmartSpaceMessage.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SmartSpaceMessageGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SmartSpaceMessageGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SmartSpaceMessageGroupByArgs['orderBy'] }
        : { orderBy?: SmartSpaceMessageGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SmartSpaceMessageGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSmartSpaceMessageGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SmartSpaceMessage model
   */
  readonly fields: SmartSpaceMessageFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SmartSpaceMessage.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SmartSpaceMessageClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    smartSpace<T extends SmartSpaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SmartSpaceDefaultArgs<ExtArgs>>): Prisma__SmartSpaceClient<$Result.GetResult<Prisma.$SmartSpacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    entity<T extends EntityDefaultArgs<ExtArgs> = {}>(args?: Subset<T, EntityDefaultArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SmartSpaceMessage model
   */
  interface SmartSpaceMessageFieldRefs {
    readonly id: FieldRef<"SmartSpaceMessage", 'String'>
    readonly smartSpaceId: FieldRef<"SmartSpaceMessage", 'String'>
    readonly entityId: FieldRef<"SmartSpaceMessage", 'String'>
    readonly role: FieldRef<"SmartSpaceMessage", 'String'>
    readonly content: FieldRef<"SmartSpaceMessage", 'String'>
    readonly metadata: FieldRef<"SmartSpaceMessage", 'Json'>
    readonly seq: FieldRef<"SmartSpaceMessage", 'BigInt'>
    readonly createdAt: FieldRef<"SmartSpaceMessage", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SmartSpaceMessage findUnique
   */
  export type SmartSpaceMessageFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMessage to fetch.
     */
    where: SmartSpaceMessageWhereUniqueInput
  }

  /**
   * SmartSpaceMessage findUniqueOrThrow
   */
  export type SmartSpaceMessageFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMessage to fetch.
     */
    where: SmartSpaceMessageWhereUniqueInput
  }

  /**
   * SmartSpaceMessage findFirst
   */
  export type SmartSpaceMessageFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMessage to fetch.
     */
    where?: SmartSpaceMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMessages to fetch.
     */
    orderBy?: SmartSpaceMessageOrderByWithRelationInput | SmartSpaceMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SmartSpaceMessages.
     */
    cursor?: SmartSpaceMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMessages.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SmartSpaceMessages.
     */
    distinct?: SmartSpaceMessageScalarFieldEnum | SmartSpaceMessageScalarFieldEnum[]
  }

  /**
   * SmartSpaceMessage findFirstOrThrow
   */
  export type SmartSpaceMessageFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMessage to fetch.
     */
    where?: SmartSpaceMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMessages to fetch.
     */
    orderBy?: SmartSpaceMessageOrderByWithRelationInput | SmartSpaceMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SmartSpaceMessages.
     */
    cursor?: SmartSpaceMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMessages.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SmartSpaceMessages.
     */
    distinct?: SmartSpaceMessageScalarFieldEnum | SmartSpaceMessageScalarFieldEnum[]
  }

  /**
   * SmartSpaceMessage findMany
   */
  export type SmartSpaceMessageFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * Filter, which SmartSpaceMessages to fetch.
     */
    where?: SmartSpaceMessageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SmartSpaceMessages to fetch.
     */
    orderBy?: SmartSpaceMessageOrderByWithRelationInput | SmartSpaceMessageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SmartSpaceMessages.
     */
    cursor?: SmartSpaceMessageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SmartSpaceMessages from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SmartSpaceMessages.
     */
    skip?: number
    distinct?: SmartSpaceMessageScalarFieldEnum | SmartSpaceMessageScalarFieldEnum[]
  }

  /**
   * SmartSpaceMessage create
   */
  export type SmartSpaceMessageCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * The data needed to create a SmartSpaceMessage.
     */
    data: XOR<SmartSpaceMessageCreateInput, SmartSpaceMessageUncheckedCreateInput>
  }

  /**
   * SmartSpaceMessage createMany
   */
  export type SmartSpaceMessageCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SmartSpaceMessages.
     */
    data: SmartSpaceMessageCreateManyInput | SmartSpaceMessageCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SmartSpaceMessage createManyAndReturn
   */
  export type SmartSpaceMessageCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * The data used to create many SmartSpaceMessages.
     */
    data: SmartSpaceMessageCreateManyInput | SmartSpaceMessageCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SmartSpaceMessage update
   */
  export type SmartSpaceMessageUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * The data needed to update a SmartSpaceMessage.
     */
    data: XOR<SmartSpaceMessageUpdateInput, SmartSpaceMessageUncheckedUpdateInput>
    /**
     * Choose, which SmartSpaceMessage to update.
     */
    where: SmartSpaceMessageWhereUniqueInput
  }

  /**
   * SmartSpaceMessage updateMany
   */
  export type SmartSpaceMessageUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SmartSpaceMessages.
     */
    data: XOR<SmartSpaceMessageUpdateManyMutationInput, SmartSpaceMessageUncheckedUpdateManyInput>
    /**
     * Filter which SmartSpaceMessages to update
     */
    where?: SmartSpaceMessageWhereInput
    /**
     * Limit how many SmartSpaceMessages to update.
     */
    limit?: number
  }

  /**
   * SmartSpaceMessage updateManyAndReturn
   */
  export type SmartSpaceMessageUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * The data used to update SmartSpaceMessages.
     */
    data: XOR<SmartSpaceMessageUpdateManyMutationInput, SmartSpaceMessageUncheckedUpdateManyInput>
    /**
     * Filter which SmartSpaceMessages to update
     */
    where?: SmartSpaceMessageWhereInput
    /**
     * Limit how many SmartSpaceMessages to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SmartSpaceMessage upsert
   */
  export type SmartSpaceMessageUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * The filter to search for the SmartSpaceMessage to update in case it exists.
     */
    where: SmartSpaceMessageWhereUniqueInput
    /**
     * In case the SmartSpaceMessage found by the `where` argument doesn't exist, create a new SmartSpaceMessage with this data.
     */
    create: XOR<SmartSpaceMessageCreateInput, SmartSpaceMessageUncheckedCreateInput>
    /**
     * In case the SmartSpaceMessage was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SmartSpaceMessageUpdateInput, SmartSpaceMessageUncheckedUpdateInput>
  }

  /**
   * SmartSpaceMessage delete
   */
  export type SmartSpaceMessageDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
    /**
     * Filter which SmartSpaceMessage to delete.
     */
    where: SmartSpaceMessageWhereUniqueInput
  }

  /**
   * SmartSpaceMessage deleteMany
   */
  export type SmartSpaceMessageDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SmartSpaceMessages to delete
     */
    where?: SmartSpaceMessageWhereInput
    /**
     * Limit how many SmartSpaceMessages to delete.
     */
    limit?: number
  }

  /**
   * SmartSpaceMessage without action
   */
  export type SmartSpaceMessageDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SmartSpaceMessage
     */
    select?: SmartSpaceMessageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SmartSpaceMessage
     */
    omit?: SmartSpaceMessageOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SmartSpaceMessageInclude<ExtArgs> | null
  }


  /**
   * Model Client
   */

  export type AggregateClient = {
    _count: ClientCountAggregateOutputType | null
    _min: ClientMinAggregateOutputType | null
    _max: ClientMaxAggregateOutputType | null
  }

  export type ClientMinAggregateOutputType = {
    id: string | null
    entityId: string | null
    clientKey: string | null
    clientType: string | null
    displayName: string | null
    createdAt: Date | null
    lastSeenAt: Date | null
  }

  export type ClientMaxAggregateOutputType = {
    id: string | null
    entityId: string | null
    clientKey: string | null
    clientType: string | null
    displayName: string | null
    createdAt: Date | null
    lastSeenAt: Date | null
  }

  export type ClientCountAggregateOutputType = {
    id: number
    entityId: number
    clientKey: number
    clientType: number
    displayName: number
    capabilities: number
    createdAt: number
    lastSeenAt: number
    _all: number
  }


  export type ClientMinAggregateInputType = {
    id?: true
    entityId?: true
    clientKey?: true
    clientType?: true
    displayName?: true
    createdAt?: true
    lastSeenAt?: true
  }

  export type ClientMaxAggregateInputType = {
    id?: true
    entityId?: true
    clientKey?: true
    clientType?: true
    displayName?: true
    createdAt?: true
    lastSeenAt?: true
  }

  export type ClientCountAggregateInputType = {
    id?: true
    entityId?: true
    clientKey?: true
    clientType?: true
    displayName?: true
    capabilities?: true
    createdAt?: true
    lastSeenAt?: true
    _all?: true
  }

  export type ClientAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Client to aggregate.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Clients
    **/
    _count?: true | ClientCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ClientMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ClientMaxAggregateInputType
  }

  export type GetClientAggregateType<T extends ClientAggregateArgs> = {
        [P in keyof T & keyof AggregateClient]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateClient[P]>
      : GetScalarType<T[P], AggregateClient[P]>
  }




  export type ClientGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ClientWhereInput
    orderBy?: ClientOrderByWithAggregationInput | ClientOrderByWithAggregationInput[]
    by: ClientScalarFieldEnum[] | ClientScalarFieldEnum
    having?: ClientScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ClientCountAggregateInputType | true
    _min?: ClientMinAggregateInputType
    _max?: ClientMaxAggregateInputType
  }

  export type ClientGroupByOutputType = {
    id: string
    entityId: string
    clientKey: string
    clientType: string | null
    displayName: string | null
    capabilities: JsonValue
    createdAt: Date
    lastSeenAt: Date | null
    _count: ClientCountAggregateOutputType | null
    _min: ClientMinAggregateOutputType | null
    _max: ClientMaxAggregateOutputType | null
  }

  type GetClientGroupByPayload<T extends ClientGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ClientGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ClientGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ClientGroupByOutputType[P]>
            : GetScalarType<T[P], ClientGroupByOutputType[P]>
        }
      >
    >


  export type ClientSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    entityId?: boolean
    clientKey?: boolean
    clientType?: boolean
    displayName?: boolean
    capabilities?: boolean
    createdAt?: boolean
    lastSeenAt?: boolean
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["client"]>

  export type ClientSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    entityId?: boolean
    clientKey?: boolean
    clientType?: boolean
    displayName?: boolean
    capabilities?: boolean
    createdAt?: boolean
    lastSeenAt?: boolean
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["client"]>

  export type ClientSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    entityId?: boolean
    clientKey?: boolean
    clientType?: boolean
    displayName?: boolean
    capabilities?: boolean
    createdAt?: boolean
    lastSeenAt?: boolean
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["client"]>

  export type ClientSelectScalar = {
    id?: boolean
    entityId?: boolean
    clientKey?: boolean
    clientType?: boolean
    displayName?: boolean
    capabilities?: boolean
    createdAt?: boolean
    lastSeenAt?: boolean
  }

  export type ClientOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "entityId" | "clientKey" | "clientType" | "displayName" | "capabilities" | "createdAt" | "lastSeenAt", ExtArgs["result"]["client"]>
  export type ClientInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }
  export type ClientIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }
  export type ClientIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    entity?: boolean | EntityDefaultArgs<ExtArgs>
  }

  export type $ClientPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Client"
    objects: {
      entity: Prisma.$EntityPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      entityId: string
      clientKey: string
      clientType: string | null
      displayName: string | null
      capabilities: Prisma.JsonValue
      createdAt: Date
      lastSeenAt: Date | null
    }, ExtArgs["result"]["client"]>
    composites: {}
  }

  type ClientGetPayload<S extends boolean | null | undefined | ClientDefaultArgs> = $Result.GetResult<Prisma.$ClientPayload, S>

  type ClientCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ClientFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ClientCountAggregateInputType | true
    }

  export interface ClientDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Client'], meta: { name: 'Client' } }
    /**
     * Find zero or one Client that matches the filter.
     * @param {ClientFindUniqueArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ClientFindUniqueArgs>(args: SelectSubset<T, ClientFindUniqueArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Client that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ClientFindUniqueOrThrowArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ClientFindUniqueOrThrowArgs>(args: SelectSubset<T, ClientFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Client that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindFirstArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ClientFindFirstArgs>(args?: SelectSubset<T, ClientFindFirstArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Client that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindFirstOrThrowArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ClientFindFirstOrThrowArgs>(args?: SelectSubset<T, ClientFindFirstOrThrowArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Clients that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Clients
     * const clients = await prisma.client.findMany()
     * 
     * // Get first 10 Clients
     * const clients = await prisma.client.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const clientWithIdOnly = await prisma.client.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ClientFindManyArgs>(args?: SelectSubset<T, ClientFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Client.
     * @param {ClientCreateArgs} args - Arguments to create a Client.
     * @example
     * // Create one Client
     * const Client = await prisma.client.create({
     *   data: {
     *     // ... data to create a Client
     *   }
     * })
     * 
     */
    create<T extends ClientCreateArgs>(args: SelectSubset<T, ClientCreateArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Clients.
     * @param {ClientCreateManyArgs} args - Arguments to create many Clients.
     * @example
     * // Create many Clients
     * const client = await prisma.client.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ClientCreateManyArgs>(args?: SelectSubset<T, ClientCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Clients and returns the data saved in the database.
     * @param {ClientCreateManyAndReturnArgs} args - Arguments to create many Clients.
     * @example
     * // Create many Clients
     * const client = await prisma.client.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Clients and only return the `id`
     * const clientWithIdOnly = await prisma.client.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ClientCreateManyAndReturnArgs>(args?: SelectSubset<T, ClientCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Client.
     * @param {ClientDeleteArgs} args - Arguments to delete one Client.
     * @example
     * // Delete one Client
     * const Client = await prisma.client.delete({
     *   where: {
     *     // ... filter to delete one Client
     *   }
     * })
     * 
     */
    delete<T extends ClientDeleteArgs>(args: SelectSubset<T, ClientDeleteArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Client.
     * @param {ClientUpdateArgs} args - Arguments to update one Client.
     * @example
     * // Update one Client
     * const client = await prisma.client.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ClientUpdateArgs>(args: SelectSubset<T, ClientUpdateArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Clients.
     * @param {ClientDeleteManyArgs} args - Arguments to filter Clients to delete.
     * @example
     * // Delete a few Clients
     * const { count } = await prisma.client.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ClientDeleteManyArgs>(args?: SelectSubset<T, ClientDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Clients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Clients
     * const client = await prisma.client.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ClientUpdateManyArgs>(args: SelectSubset<T, ClientUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Clients and returns the data updated in the database.
     * @param {ClientUpdateManyAndReturnArgs} args - Arguments to update many Clients.
     * @example
     * // Update many Clients
     * const client = await prisma.client.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Clients and only return the `id`
     * const clientWithIdOnly = await prisma.client.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ClientUpdateManyAndReturnArgs>(args: SelectSubset<T, ClientUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Client.
     * @param {ClientUpsertArgs} args - Arguments to update or create a Client.
     * @example
     * // Update or create a Client
     * const client = await prisma.client.upsert({
     *   create: {
     *     // ... data to create a Client
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Client we want to update
     *   }
     * })
     */
    upsert<T extends ClientUpsertArgs>(args: SelectSubset<T, ClientUpsertArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Clients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientCountArgs} args - Arguments to filter Clients to count.
     * @example
     * // Count the number of Clients
     * const count = await prisma.client.count({
     *   where: {
     *     // ... the filter for the Clients we want to count
     *   }
     * })
    **/
    count<T extends ClientCountArgs>(
      args?: Subset<T, ClientCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ClientCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Client.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ClientAggregateArgs>(args: Subset<T, ClientAggregateArgs>): Prisma.PrismaPromise<GetClientAggregateType<T>>

    /**
     * Group by Client.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ClientGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ClientGroupByArgs['orderBy'] }
        : { orderBy?: ClientGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ClientGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetClientGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Client model
   */
  readonly fields: ClientFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Client.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ClientClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    entity<T extends EntityDefaultArgs<ExtArgs> = {}>(args?: Subset<T, EntityDefaultArgs<ExtArgs>>): Prisma__EntityClient<$Result.GetResult<Prisma.$EntityPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Client model
   */
  interface ClientFieldRefs {
    readonly id: FieldRef<"Client", 'String'>
    readonly entityId: FieldRef<"Client", 'String'>
    readonly clientKey: FieldRef<"Client", 'String'>
    readonly clientType: FieldRef<"Client", 'String'>
    readonly displayName: FieldRef<"Client", 'String'>
    readonly capabilities: FieldRef<"Client", 'Json'>
    readonly createdAt: FieldRef<"Client", 'DateTime'>
    readonly lastSeenAt: FieldRef<"Client", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Client findUnique
   */
  export type ClientFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client findUniqueOrThrow
   */
  export type ClientFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client findFirst
   */
  export type ClientFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Clients.
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Clients.
     */
    distinct?: ClientScalarFieldEnum | ClientScalarFieldEnum[]
  }

  /**
   * Client findFirstOrThrow
   */
  export type ClientFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Clients.
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Clients.
     */
    distinct?: ClientScalarFieldEnum | ClientScalarFieldEnum[]
  }

  /**
   * Client findMany
   */
  export type ClientFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Clients to fetch.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Clients.
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    distinct?: ClientScalarFieldEnum | ClientScalarFieldEnum[]
  }

  /**
   * Client create
   */
  export type ClientCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * The data needed to create a Client.
     */
    data: XOR<ClientCreateInput, ClientUncheckedCreateInput>
  }

  /**
   * Client createMany
   */
  export type ClientCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Clients.
     */
    data: ClientCreateManyInput | ClientCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Client createManyAndReturn
   */
  export type ClientCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * The data used to create many Clients.
     */
    data: ClientCreateManyInput | ClientCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Client update
   */
  export type ClientUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * The data needed to update a Client.
     */
    data: XOR<ClientUpdateInput, ClientUncheckedUpdateInput>
    /**
     * Choose, which Client to update.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client updateMany
   */
  export type ClientUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Clients.
     */
    data: XOR<ClientUpdateManyMutationInput, ClientUncheckedUpdateManyInput>
    /**
     * Filter which Clients to update
     */
    where?: ClientWhereInput
    /**
     * Limit how many Clients to update.
     */
    limit?: number
  }

  /**
   * Client updateManyAndReturn
   */
  export type ClientUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * The data used to update Clients.
     */
    data: XOR<ClientUpdateManyMutationInput, ClientUncheckedUpdateManyInput>
    /**
     * Filter which Clients to update
     */
    where?: ClientWhereInput
    /**
     * Limit how many Clients to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Client upsert
   */
  export type ClientUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * The filter to search for the Client to update in case it exists.
     */
    where: ClientWhereUniqueInput
    /**
     * In case the Client found by the `where` argument doesn't exist, create a new Client with this data.
     */
    create: XOR<ClientCreateInput, ClientUncheckedCreateInput>
    /**
     * In case the Client was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ClientUpdateInput, ClientUncheckedUpdateInput>
  }

  /**
   * Client delete
   */
  export type ClientDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter which Client to delete.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client deleteMany
   */
  export type ClientDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Clients to delete
     */
    where?: ClientWhereInput
    /**
     * Limit how many Clients to delete.
     */
    limit?: number
  }

  /**
   * Client without action
   */
  export type ClientDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserScalarFieldEnum: {
    id: 'id',
    email: 'email',
    name: 'name',
    passwordHash: 'passwordHash',
    hsafaEntityId: 'hsafaEntityId',
    hsafaSpaceId: 'hsafaSpaceId',
    agentEntityId: 'agentEntityId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const EntityScalarFieldEnum: {
    id: 'id',
    type: 'type',
    externalId: 'externalId',
    displayName: 'displayName',
    metadata: 'metadata',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type EntityScalarFieldEnum = (typeof EntityScalarFieldEnum)[keyof typeof EntityScalarFieldEnum]


  export const SmartSpaceScalarFieldEnum: {
    id: 'id',
    name: 'name',
    description: 'description',
    metadata: 'metadata',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SmartSpaceScalarFieldEnum = (typeof SmartSpaceScalarFieldEnum)[keyof typeof SmartSpaceScalarFieldEnum]


  export const SmartSpaceMembershipScalarFieldEnum: {
    id: 'id',
    smartSpaceId: 'smartSpaceId',
    entityId: 'entityId',
    role: 'role',
    joinedAt: 'joinedAt',
    lastSeenMessageId: 'lastSeenMessageId'
  };

  export type SmartSpaceMembershipScalarFieldEnum = (typeof SmartSpaceMembershipScalarFieldEnum)[keyof typeof SmartSpaceMembershipScalarFieldEnum]


  export const SmartSpaceMessageScalarFieldEnum: {
    id: 'id',
    smartSpaceId: 'smartSpaceId',
    entityId: 'entityId',
    role: 'role',
    content: 'content',
    metadata: 'metadata',
    seq: 'seq',
    createdAt: 'createdAt'
  };

  export type SmartSpaceMessageScalarFieldEnum = (typeof SmartSpaceMessageScalarFieldEnum)[keyof typeof SmartSpaceMessageScalarFieldEnum]


  export const ClientScalarFieldEnum: {
    id: 'id',
    entityId: 'entityId',
    clientKey: 'clientKey',
    clientType: 'clientType',
    displayName: 'displayName',
    capabilities: 'capabilities',
    createdAt: 'createdAt',
    lastSeenAt: 'lastSeenAt'
  };

  export type ClientScalarFieldEnum = (typeof ClientScalarFieldEnum)[keyof typeof ClientScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'EntityType'
   */
  export type EnumEntityTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'EntityType'>
    


  /**
   * Reference to a field of type 'EntityType[]'
   */
  export type ListEnumEntityTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'EntityType[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'BigInt'
   */
  export type BigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt'>
    


  /**
   * Reference to a field of type 'BigInt[]'
   */
  export type ListBigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: StringFilter<"User"> | string
    email?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    passwordHash?: StringFilter<"User"> | string
    hsafaEntityId?: StringNullableFilter<"User"> | string | null
    hsafaSpaceId?: StringNullableFilter<"User"> | string | null
    agentEntityId?: StringNullableFilter<"User"> | string | null
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    email?: SortOrder
    name?: SortOrder
    passwordHash?: SortOrder
    hsafaEntityId?: SortOrderInput | SortOrder
    hsafaSpaceId?: SortOrderInput | SortOrder
    agentEntityId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    email?: string
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    name?: StringFilter<"User"> | string
    passwordHash?: StringFilter<"User"> | string
    hsafaEntityId?: StringNullableFilter<"User"> | string | null
    hsafaSpaceId?: StringNullableFilter<"User"> | string | null
    agentEntityId?: StringNullableFilter<"User"> | string | null
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
  }, "id" | "email">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    email?: SortOrder
    name?: SortOrder
    passwordHash?: SortOrder
    hsafaEntityId?: SortOrderInput | SortOrder
    hsafaSpaceId?: SortOrderInput | SortOrder
    agentEntityId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"User"> | string
    email?: StringWithAggregatesFilter<"User"> | string
    name?: StringWithAggregatesFilter<"User"> | string
    passwordHash?: StringWithAggregatesFilter<"User"> | string
    hsafaEntityId?: StringNullableWithAggregatesFilter<"User"> | string | null
    hsafaSpaceId?: StringNullableWithAggregatesFilter<"User"> | string | null
    agentEntityId?: StringNullableWithAggregatesFilter<"User"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
  }

  export type EntityWhereInput = {
    AND?: EntityWhereInput | EntityWhereInput[]
    OR?: EntityWhereInput[]
    NOT?: EntityWhereInput | EntityWhereInput[]
    id?: UuidFilter<"Entity"> | string
    type?: EnumEntityTypeFilter<"Entity"> | $Enums.EntityType
    externalId?: StringNullableFilter<"Entity"> | string | null
    displayName?: StringNullableFilter<"Entity"> | string | null
    metadata?: JsonNullableFilter<"Entity">
    createdAt?: DateTimeFilter<"Entity"> | Date | string
    updatedAt?: DateTimeFilter<"Entity"> | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipListRelationFilter
    messages?: SmartSpaceMessageListRelationFilter
    clients?: ClientListRelationFilter
  }

  export type EntityOrderByWithRelationInput = {
    id?: SortOrder
    type?: SortOrder
    externalId?: SortOrderInput | SortOrder
    displayName?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    smartSpaceMemberships?: SmartSpaceMembershipOrderByRelationAggregateInput
    messages?: SmartSpaceMessageOrderByRelationAggregateInput
    clients?: ClientOrderByRelationAggregateInput
  }

  export type EntityWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    externalId?: string
    AND?: EntityWhereInput | EntityWhereInput[]
    OR?: EntityWhereInput[]
    NOT?: EntityWhereInput | EntityWhereInput[]
    type?: EnumEntityTypeFilter<"Entity"> | $Enums.EntityType
    displayName?: StringNullableFilter<"Entity"> | string | null
    metadata?: JsonNullableFilter<"Entity">
    createdAt?: DateTimeFilter<"Entity"> | Date | string
    updatedAt?: DateTimeFilter<"Entity"> | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipListRelationFilter
    messages?: SmartSpaceMessageListRelationFilter
    clients?: ClientListRelationFilter
  }, "id" | "externalId">

  export type EntityOrderByWithAggregationInput = {
    id?: SortOrder
    type?: SortOrder
    externalId?: SortOrderInput | SortOrder
    displayName?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: EntityCountOrderByAggregateInput
    _max?: EntityMaxOrderByAggregateInput
    _min?: EntityMinOrderByAggregateInput
  }

  export type EntityScalarWhereWithAggregatesInput = {
    AND?: EntityScalarWhereWithAggregatesInput | EntityScalarWhereWithAggregatesInput[]
    OR?: EntityScalarWhereWithAggregatesInput[]
    NOT?: EntityScalarWhereWithAggregatesInput | EntityScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Entity"> | string
    type?: EnumEntityTypeWithAggregatesFilter<"Entity"> | $Enums.EntityType
    externalId?: StringNullableWithAggregatesFilter<"Entity"> | string | null
    displayName?: StringNullableWithAggregatesFilter<"Entity"> | string | null
    metadata?: JsonNullableWithAggregatesFilter<"Entity">
    createdAt?: DateTimeWithAggregatesFilter<"Entity"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Entity"> | Date | string
  }

  export type SmartSpaceWhereInput = {
    AND?: SmartSpaceWhereInput | SmartSpaceWhereInput[]
    OR?: SmartSpaceWhereInput[]
    NOT?: SmartSpaceWhereInput | SmartSpaceWhereInput[]
    id?: UuidFilter<"SmartSpace"> | string
    name?: StringNullableFilter<"SmartSpace"> | string | null
    description?: StringNullableFilter<"SmartSpace"> | string | null
    metadata?: JsonNullableFilter<"SmartSpace">
    createdAt?: DateTimeFilter<"SmartSpace"> | Date | string
    updatedAt?: DateTimeFilter<"SmartSpace"> | Date | string
    memberships?: SmartSpaceMembershipListRelationFilter
    messages?: SmartSpaceMessageListRelationFilter
  }

  export type SmartSpaceOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    memberships?: SmartSpaceMembershipOrderByRelationAggregateInput
    messages?: SmartSpaceMessageOrderByRelationAggregateInput
  }

  export type SmartSpaceWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SmartSpaceWhereInput | SmartSpaceWhereInput[]
    OR?: SmartSpaceWhereInput[]
    NOT?: SmartSpaceWhereInput | SmartSpaceWhereInput[]
    name?: StringNullableFilter<"SmartSpace"> | string | null
    description?: StringNullableFilter<"SmartSpace"> | string | null
    metadata?: JsonNullableFilter<"SmartSpace">
    createdAt?: DateTimeFilter<"SmartSpace"> | Date | string
    updatedAt?: DateTimeFilter<"SmartSpace"> | Date | string
    memberships?: SmartSpaceMembershipListRelationFilter
    messages?: SmartSpaceMessageListRelationFilter
  }, "id">

  export type SmartSpaceOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrderInput | SortOrder
    description?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SmartSpaceCountOrderByAggregateInput
    _max?: SmartSpaceMaxOrderByAggregateInput
    _min?: SmartSpaceMinOrderByAggregateInput
  }

  export type SmartSpaceScalarWhereWithAggregatesInput = {
    AND?: SmartSpaceScalarWhereWithAggregatesInput | SmartSpaceScalarWhereWithAggregatesInput[]
    OR?: SmartSpaceScalarWhereWithAggregatesInput[]
    NOT?: SmartSpaceScalarWhereWithAggregatesInput | SmartSpaceScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SmartSpace"> | string
    name?: StringNullableWithAggregatesFilter<"SmartSpace"> | string | null
    description?: StringNullableWithAggregatesFilter<"SmartSpace"> | string | null
    metadata?: JsonNullableWithAggregatesFilter<"SmartSpace">
    createdAt?: DateTimeWithAggregatesFilter<"SmartSpace"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SmartSpace"> | Date | string
  }

  export type SmartSpaceMembershipWhereInput = {
    AND?: SmartSpaceMembershipWhereInput | SmartSpaceMembershipWhereInput[]
    OR?: SmartSpaceMembershipWhereInput[]
    NOT?: SmartSpaceMembershipWhereInput | SmartSpaceMembershipWhereInput[]
    id?: UuidFilter<"SmartSpaceMembership"> | string
    smartSpaceId?: UuidFilter<"SmartSpaceMembership"> | string
    entityId?: UuidFilter<"SmartSpaceMembership"> | string
    role?: StringNullableFilter<"SmartSpaceMembership"> | string | null
    joinedAt?: DateTimeFilter<"SmartSpaceMembership"> | Date | string
    lastSeenMessageId?: UuidNullableFilter<"SmartSpaceMembership"> | string | null
    smartSpace?: XOR<SmartSpaceScalarRelationFilter, SmartSpaceWhereInput>
    entity?: XOR<EntityScalarRelationFilter, EntityWhereInput>
  }

  export type SmartSpaceMembershipOrderByWithRelationInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrderInput | SortOrder
    joinedAt?: SortOrder
    lastSeenMessageId?: SortOrderInput | SortOrder
    smartSpace?: SmartSpaceOrderByWithRelationInput
    entity?: EntityOrderByWithRelationInput
  }

  export type SmartSpaceMembershipWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    smartSpaceId_entityId?: SmartSpaceMembershipSmartSpaceIdEntityIdCompoundUniqueInput
    AND?: SmartSpaceMembershipWhereInput | SmartSpaceMembershipWhereInput[]
    OR?: SmartSpaceMembershipWhereInput[]
    NOT?: SmartSpaceMembershipWhereInput | SmartSpaceMembershipWhereInput[]
    smartSpaceId?: UuidFilter<"SmartSpaceMembership"> | string
    entityId?: UuidFilter<"SmartSpaceMembership"> | string
    role?: StringNullableFilter<"SmartSpaceMembership"> | string | null
    joinedAt?: DateTimeFilter<"SmartSpaceMembership"> | Date | string
    lastSeenMessageId?: UuidNullableFilter<"SmartSpaceMembership"> | string | null
    smartSpace?: XOR<SmartSpaceScalarRelationFilter, SmartSpaceWhereInput>
    entity?: XOR<EntityScalarRelationFilter, EntityWhereInput>
  }, "id" | "smartSpaceId_entityId">

  export type SmartSpaceMembershipOrderByWithAggregationInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrderInput | SortOrder
    joinedAt?: SortOrder
    lastSeenMessageId?: SortOrderInput | SortOrder
    _count?: SmartSpaceMembershipCountOrderByAggregateInput
    _max?: SmartSpaceMembershipMaxOrderByAggregateInput
    _min?: SmartSpaceMembershipMinOrderByAggregateInput
  }

  export type SmartSpaceMembershipScalarWhereWithAggregatesInput = {
    AND?: SmartSpaceMembershipScalarWhereWithAggregatesInput | SmartSpaceMembershipScalarWhereWithAggregatesInput[]
    OR?: SmartSpaceMembershipScalarWhereWithAggregatesInput[]
    NOT?: SmartSpaceMembershipScalarWhereWithAggregatesInput | SmartSpaceMembershipScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SmartSpaceMembership"> | string
    smartSpaceId?: UuidWithAggregatesFilter<"SmartSpaceMembership"> | string
    entityId?: UuidWithAggregatesFilter<"SmartSpaceMembership"> | string
    role?: StringNullableWithAggregatesFilter<"SmartSpaceMembership"> | string | null
    joinedAt?: DateTimeWithAggregatesFilter<"SmartSpaceMembership"> | Date | string
    lastSeenMessageId?: UuidNullableWithAggregatesFilter<"SmartSpaceMembership"> | string | null
  }

  export type SmartSpaceMessageWhereInput = {
    AND?: SmartSpaceMessageWhereInput | SmartSpaceMessageWhereInput[]
    OR?: SmartSpaceMessageWhereInput[]
    NOT?: SmartSpaceMessageWhereInput | SmartSpaceMessageWhereInput[]
    id?: UuidFilter<"SmartSpaceMessage"> | string
    smartSpaceId?: UuidFilter<"SmartSpaceMessage"> | string
    entityId?: UuidFilter<"SmartSpaceMessage"> | string
    role?: StringFilter<"SmartSpaceMessage"> | string
    content?: StringNullableFilter<"SmartSpaceMessage"> | string | null
    metadata?: JsonNullableFilter<"SmartSpaceMessage">
    seq?: BigIntFilter<"SmartSpaceMessage"> | bigint | number
    createdAt?: DateTimeFilter<"SmartSpaceMessage"> | Date | string
    smartSpace?: XOR<SmartSpaceScalarRelationFilter, SmartSpaceWhereInput>
    entity?: XOR<EntityScalarRelationFilter, EntityWhereInput>
  }

  export type SmartSpaceMessageOrderByWithRelationInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    content?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    seq?: SortOrder
    createdAt?: SortOrder
    smartSpace?: SmartSpaceOrderByWithRelationInput
    entity?: EntityOrderByWithRelationInput
  }

  export type SmartSpaceMessageWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    smartSpaceId_seq?: SmartSpaceMessageSmartSpaceIdSeqCompoundUniqueInput
    AND?: SmartSpaceMessageWhereInput | SmartSpaceMessageWhereInput[]
    OR?: SmartSpaceMessageWhereInput[]
    NOT?: SmartSpaceMessageWhereInput | SmartSpaceMessageWhereInput[]
    smartSpaceId?: UuidFilter<"SmartSpaceMessage"> | string
    entityId?: UuidFilter<"SmartSpaceMessage"> | string
    role?: StringFilter<"SmartSpaceMessage"> | string
    content?: StringNullableFilter<"SmartSpaceMessage"> | string | null
    metadata?: JsonNullableFilter<"SmartSpaceMessage">
    seq?: BigIntFilter<"SmartSpaceMessage"> | bigint | number
    createdAt?: DateTimeFilter<"SmartSpaceMessage"> | Date | string
    smartSpace?: XOR<SmartSpaceScalarRelationFilter, SmartSpaceWhereInput>
    entity?: XOR<EntityScalarRelationFilter, EntityWhereInput>
  }, "id" | "smartSpaceId_seq">

  export type SmartSpaceMessageOrderByWithAggregationInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    content?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    seq?: SortOrder
    createdAt?: SortOrder
    _count?: SmartSpaceMessageCountOrderByAggregateInput
    _avg?: SmartSpaceMessageAvgOrderByAggregateInput
    _max?: SmartSpaceMessageMaxOrderByAggregateInput
    _min?: SmartSpaceMessageMinOrderByAggregateInput
    _sum?: SmartSpaceMessageSumOrderByAggregateInput
  }

  export type SmartSpaceMessageScalarWhereWithAggregatesInput = {
    AND?: SmartSpaceMessageScalarWhereWithAggregatesInput | SmartSpaceMessageScalarWhereWithAggregatesInput[]
    OR?: SmartSpaceMessageScalarWhereWithAggregatesInput[]
    NOT?: SmartSpaceMessageScalarWhereWithAggregatesInput | SmartSpaceMessageScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SmartSpaceMessage"> | string
    smartSpaceId?: UuidWithAggregatesFilter<"SmartSpaceMessage"> | string
    entityId?: UuidWithAggregatesFilter<"SmartSpaceMessage"> | string
    role?: StringWithAggregatesFilter<"SmartSpaceMessage"> | string
    content?: StringNullableWithAggregatesFilter<"SmartSpaceMessage"> | string | null
    metadata?: JsonNullableWithAggregatesFilter<"SmartSpaceMessage">
    seq?: BigIntWithAggregatesFilter<"SmartSpaceMessage"> | bigint | number
    createdAt?: DateTimeWithAggregatesFilter<"SmartSpaceMessage"> | Date | string
  }

  export type ClientWhereInput = {
    AND?: ClientWhereInput | ClientWhereInput[]
    OR?: ClientWhereInput[]
    NOT?: ClientWhereInput | ClientWhereInput[]
    id?: UuidFilter<"Client"> | string
    entityId?: UuidFilter<"Client"> | string
    clientKey?: StringFilter<"Client"> | string
    clientType?: StringNullableFilter<"Client"> | string | null
    displayName?: StringNullableFilter<"Client"> | string | null
    capabilities?: JsonFilter<"Client">
    createdAt?: DateTimeFilter<"Client"> | Date | string
    lastSeenAt?: DateTimeNullableFilter<"Client"> | Date | string | null
    entity?: XOR<EntityScalarRelationFilter, EntityWhereInput>
  }

  export type ClientOrderByWithRelationInput = {
    id?: SortOrder
    entityId?: SortOrder
    clientKey?: SortOrder
    clientType?: SortOrderInput | SortOrder
    displayName?: SortOrderInput | SortOrder
    capabilities?: SortOrder
    createdAt?: SortOrder
    lastSeenAt?: SortOrderInput | SortOrder
    entity?: EntityOrderByWithRelationInput
  }

  export type ClientWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    clientKey?: string
    AND?: ClientWhereInput | ClientWhereInput[]
    OR?: ClientWhereInput[]
    NOT?: ClientWhereInput | ClientWhereInput[]
    entityId?: UuidFilter<"Client"> | string
    clientType?: StringNullableFilter<"Client"> | string | null
    displayName?: StringNullableFilter<"Client"> | string | null
    capabilities?: JsonFilter<"Client">
    createdAt?: DateTimeFilter<"Client"> | Date | string
    lastSeenAt?: DateTimeNullableFilter<"Client"> | Date | string | null
    entity?: XOR<EntityScalarRelationFilter, EntityWhereInput>
  }, "id" | "clientKey">

  export type ClientOrderByWithAggregationInput = {
    id?: SortOrder
    entityId?: SortOrder
    clientKey?: SortOrder
    clientType?: SortOrderInput | SortOrder
    displayName?: SortOrderInput | SortOrder
    capabilities?: SortOrder
    createdAt?: SortOrder
    lastSeenAt?: SortOrderInput | SortOrder
    _count?: ClientCountOrderByAggregateInput
    _max?: ClientMaxOrderByAggregateInput
    _min?: ClientMinOrderByAggregateInput
  }

  export type ClientScalarWhereWithAggregatesInput = {
    AND?: ClientScalarWhereWithAggregatesInput | ClientScalarWhereWithAggregatesInput[]
    OR?: ClientScalarWhereWithAggregatesInput[]
    NOT?: ClientScalarWhereWithAggregatesInput | ClientScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Client"> | string
    entityId?: UuidWithAggregatesFilter<"Client"> | string
    clientKey?: StringWithAggregatesFilter<"Client"> | string
    clientType?: StringNullableWithAggregatesFilter<"Client"> | string | null
    displayName?: StringNullableWithAggregatesFilter<"Client"> | string | null
    capabilities?: JsonWithAggregatesFilter<"Client">
    createdAt?: DateTimeWithAggregatesFilter<"Client"> | Date | string
    lastSeenAt?: DateTimeNullableWithAggregatesFilter<"Client"> | Date | string | null
  }

  export type UserCreateInput = {
    id?: string
    email: string
    name: string
    passwordHash: string
    hsafaEntityId?: string | null
    hsafaSpaceId?: string | null
    agentEntityId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUncheckedCreateInput = {
    id?: string
    email: string
    name: string
    passwordHash: string
    hsafaEntityId?: string | null
    hsafaSpaceId?: string | null
    agentEntityId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    hsafaEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    hsafaSpaceId?: NullableStringFieldUpdateOperationsInput | string | null
    agentEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    hsafaEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    hsafaSpaceId?: NullableStringFieldUpdateOperationsInput | string | null
    agentEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserCreateManyInput = {
    id?: string
    email: string
    name: string
    passwordHash: string
    hsafaEntityId?: string | null
    hsafaSpaceId?: string | null
    agentEntityId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    hsafaEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    hsafaSpaceId?: NullableStringFieldUpdateOperationsInput | string | null
    agentEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    hsafaEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    hsafaSpaceId?: NullableStringFieldUpdateOperationsInput | string | null
    agentEntityId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EntityCreateInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    smartSpaceMemberships?: SmartSpaceMembershipCreateNestedManyWithoutEntityInput
    messages?: SmartSpaceMessageCreateNestedManyWithoutEntityInput
    clients?: ClientCreateNestedManyWithoutEntityInput
  }

  export type EntityUncheckedCreateInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUncheckedCreateNestedManyWithoutEntityInput
    messages?: SmartSpaceMessageUncheckedCreateNestedManyWithoutEntityInput
    clients?: ClientUncheckedCreateNestedManyWithoutEntityInput
  }

  export type EntityUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUpdateManyWithoutEntityNestedInput
    messages?: SmartSpaceMessageUpdateManyWithoutEntityNestedInput
    clients?: ClientUpdateManyWithoutEntityNestedInput
  }

  export type EntityUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUncheckedUpdateManyWithoutEntityNestedInput
    messages?: SmartSpaceMessageUncheckedUpdateManyWithoutEntityNestedInput
    clients?: ClientUncheckedUpdateManyWithoutEntityNestedInput
  }

  export type EntityCreateManyInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type EntityUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EntityUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SmartSpaceCreateInput = {
    id?: string
    name?: string | null
    description?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    memberships?: SmartSpaceMembershipCreateNestedManyWithoutSmartSpaceInput
    messages?: SmartSpaceMessageCreateNestedManyWithoutSmartSpaceInput
  }

  export type SmartSpaceUncheckedCreateInput = {
    id?: string
    name?: string | null
    description?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    memberships?: SmartSpaceMembershipUncheckedCreateNestedManyWithoutSmartSpaceInput
    messages?: SmartSpaceMessageUncheckedCreateNestedManyWithoutSmartSpaceInput
  }

  export type SmartSpaceUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    memberships?: SmartSpaceMembershipUpdateManyWithoutSmartSpaceNestedInput
    messages?: SmartSpaceMessageUpdateManyWithoutSmartSpaceNestedInput
  }

  export type SmartSpaceUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    memberships?: SmartSpaceMembershipUncheckedUpdateManyWithoutSmartSpaceNestedInput
    messages?: SmartSpaceMessageUncheckedUpdateManyWithoutSmartSpaceNestedInput
  }

  export type SmartSpaceCreateManyInput = {
    id?: string
    name?: string | null
    description?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SmartSpaceUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SmartSpaceUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SmartSpaceMembershipCreateInput = {
    id?: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
    smartSpace: SmartSpaceCreateNestedOneWithoutMembershipsInput
    entity: EntityCreateNestedOneWithoutSmartSpaceMembershipsInput
  }

  export type SmartSpaceMembershipUncheckedCreateInput = {
    id?: string
    smartSpaceId: string
    entityId: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
  }

  export type SmartSpaceMembershipUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
    smartSpace?: SmartSpaceUpdateOneRequiredWithoutMembershipsNestedInput
    entity?: EntityUpdateOneRequiredWithoutSmartSpaceMembershipsNestedInput
  }

  export type SmartSpaceMembershipUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SmartSpaceMembershipCreateManyInput = {
    id?: string
    smartSpaceId: string
    entityId: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
  }

  export type SmartSpaceMembershipUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SmartSpaceMembershipUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SmartSpaceMessageCreateInput = {
    id?: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
    smartSpace: SmartSpaceCreateNestedOneWithoutMessagesInput
    entity: EntityCreateNestedOneWithoutMessagesInput
  }

  export type SmartSpaceMessageUncheckedCreateInput = {
    id?: string
    smartSpaceId: string
    entityId: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
  }

  export type SmartSpaceMessageUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpace?: SmartSpaceUpdateOneRequiredWithoutMessagesNestedInput
    entity?: EntityUpdateOneRequiredWithoutMessagesNestedInput
  }

  export type SmartSpaceMessageUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SmartSpaceMessageCreateManyInput = {
    id?: string
    smartSpaceId: string
    entityId: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
  }

  export type SmartSpaceMessageUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SmartSpaceMessageUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ClientCreateInput = {
    id?: string
    clientKey: string
    clientType?: string | null
    displayName?: string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    lastSeenAt?: Date | string | null
    entity: EntityCreateNestedOneWithoutClientsInput
  }

  export type ClientUncheckedCreateInput = {
    id?: string
    entityId: string
    clientKey: string
    clientType?: string | null
    displayName?: string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    lastSeenAt?: Date | string | null
  }

  export type ClientUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    clientKey?: StringFieldUpdateOperationsInput | string
    clientType?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    entity?: EntityUpdateOneRequiredWithoutClientsNestedInput
  }

  export type ClientUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    clientKey?: StringFieldUpdateOperationsInput | string
    clientType?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ClientCreateManyInput = {
    id?: string
    entityId: string
    clientKey: string
    clientType?: string | null
    displayName?: string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    lastSeenAt?: Date | string | null
  }

  export type ClientUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    clientKey?: StringFieldUpdateOperationsInput | string
    clientType?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ClientUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    clientKey?: StringFieldUpdateOperationsInput | string
    clientType?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    name?: SortOrder
    passwordHash?: SortOrder
    hsafaEntityId?: SortOrder
    hsafaSpaceId?: SortOrder
    agentEntityId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    name?: SortOrder
    passwordHash?: SortOrder
    hsafaEntityId?: SortOrder
    hsafaSpaceId?: SortOrder
    agentEntityId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    name?: SortOrder
    passwordHash?: SortOrder
    hsafaEntityId?: SortOrder
    hsafaSpaceId?: SortOrder
    agentEntityId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type UuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type EnumEntityTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.EntityType | EnumEntityTypeFieldRefInput<$PrismaModel>
    in?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumEntityTypeFilter<$PrismaModel> | $Enums.EntityType
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type SmartSpaceMembershipListRelationFilter = {
    every?: SmartSpaceMembershipWhereInput
    some?: SmartSpaceMembershipWhereInput
    none?: SmartSpaceMembershipWhereInput
  }

  export type SmartSpaceMessageListRelationFilter = {
    every?: SmartSpaceMessageWhereInput
    some?: SmartSpaceMessageWhereInput
    none?: SmartSpaceMessageWhereInput
  }

  export type ClientListRelationFilter = {
    every?: ClientWhereInput
    some?: ClientWhereInput
    none?: ClientWhereInput
  }

  export type SmartSpaceMembershipOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SmartSpaceMessageOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ClientOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type EntityCountOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    externalId?: SortOrder
    displayName?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EntityMaxOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    externalId?: SortOrder
    displayName?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EntityMinOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    externalId?: SortOrder
    displayName?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type EnumEntityTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.EntityType | EnumEntityTypeFieldRefInput<$PrismaModel>
    in?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumEntityTypeWithAggregatesFilter<$PrismaModel> | $Enums.EntityType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumEntityTypeFilter<$PrismaModel>
    _max?: NestedEnumEntityTypeFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type SmartSpaceCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SmartSpaceMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SmartSpaceMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }

  export type SmartSpaceScalarRelationFilter = {
    is?: SmartSpaceWhereInput
    isNot?: SmartSpaceWhereInput
  }

  export type EntityScalarRelationFilter = {
    is?: EntityWhereInput
    isNot?: EntityWhereInput
  }

  export type SmartSpaceMembershipSmartSpaceIdEntityIdCompoundUniqueInput = {
    smartSpaceId: string
    entityId: string
  }

  export type SmartSpaceMembershipCountOrderByAggregateInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    joinedAt?: SortOrder
    lastSeenMessageId?: SortOrder
  }

  export type SmartSpaceMembershipMaxOrderByAggregateInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    joinedAt?: SortOrder
    lastSeenMessageId?: SortOrder
  }

  export type SmartSpaceMembershipMinOrderByAggregateInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    joinedAt?: SortOrder
    lastSeenMessageId?: SortOrder
  }

  export type UuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type BigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type SmartSpaceMessageSmartSpaceIdSeqCompoundUniqueInput = {
    smartSpaceId: string
    seq: bigint | number
  }

  export type SmartSpaceMessageCountOrderByAggregateInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    content?: SortOrder
    metadata?: SortOrder
    seq?: SortOrder
    createdAt?: SortOrder
  }

  export type SmartSpaceMessageAvgOrderByAggregateInput = {
    seq?: SortOrder
  }

  export type SmartSpaceMessageMaxOrderByAggregateInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    content?: SortOrder
    seq?: SortOrder
    createdAt?: SortOrder
  }

  export type SmartSpaceMessageMinOrderByAggregateInput = {
    id?: SortOrder
    smartSpaceId?: SortOrder
    entityId?: SortOrder
    role?: SortOrder
    content?: SortOrder
    seq?: SortOrder
    createdAt?: SortOrder
  }

  export type SmartSpaceMessageSumOrderByAggregateInput = {
    seq?: SortOrder
  }

  export type BigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type ClientCountOrderByAggregateInput = {
    id?: SortOrder
    entityId?: SortOrder
    clientKey?: SortOrder
    clientType?: SortOrder
    displayName?: SortOrder
    capabilities?: SortOrder
    createdAt?: SortOrder
    lastSeenAt?: SortOrder
  }

  export type ClientMaxOrderByAggregateInput = {
    id?: SortOrder
    entityId?: SortOrder
    clientKey?: SortOrder
    clientType?: SortOrder
    displayName?: SortOrder
    createdAt?: SortOrder
    lastSeenAt?: SortOrder
  }

  export type ClientMinOrderByAggregateInput = {
    id?: SortOrder
    entityId?: SortOrder
    clientKey?: SortOrder
    clientType?: SortOrder
    displayName?: SortOrder
    createdAt?: SortOrder
    lastSeenAt?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type SmartSpaceMembershipCreateNestedManyWithoutEntityInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutEntityInput, SmartSpaceMembershipUncheckedCreateWithoutEntityInput> | SmartSpaceMembershipCreateWithoutEntityInput[] | SmartSpaceMembershipUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutEntityInput | SmartSpaceMembershipCreateOrConnectWithoutEntityInput[]
    createMany?: SmartSpaceMembershipCreateManyEntityInputEnvelope
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
  }

  export type SmartSpaceMessageCreateNestedManyWithoutEntityInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutEntityInput, SmartSpaceMessageUncheckedCreateWithoutEntityInput> | SmartSpaceMessageCreateWithoutEntityInput[] | SmartSpaceMessageUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutEntityInput | SmartSpaceMessageCreateOrConnectWithoutEntityInput[]
    createMany?: SmartSpaceMessageCreateManyEntityInputEnvelope
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
  }

  export type ClientCreateNestedManyWithoutEntityInput = {
    create?: XOR<ClientCreateWithoutEntityInput, ClientUncheckedCreateWithoutEntityInput> | ClientCreateWithoutEntityInput[] | ClientUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: ClientCreateOrConnectWithoutEntityInput | ClientCreateOrConnectWithoutEntityInput[]
    createMany?: ClientCreateManyEntityInputEnvelope
    connect?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
  }

  export type SmartSpaceMembershipUncheckedCreateNestedManyWithoutEntityInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutEntityInput, SmartSpaceMembershipUncheckedCreateWithoutEntityInput> | SmartSpaceMembershipCreateWithoutEntityInput[] | SmartSpaceMembershipUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutEntityInput | SmartSpaceMembershipCreateOrConnectWithoutEntityInput[]
    createMany?: SmartSpaceMembershipCreateManyEntityInputEnvelope
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
  }

  export type SmartSpaceMessageUncheckedCreateNestedManyWithoutEntityInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutEntityInput, SmartSpaceMessageUncheckedCreateWithoutEntityInput> | SmartSpaceMessageCreateWithoutEntityInput[] | SmartSpaceMessageUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutEntityInput | SmartSpaceMessageCreateOrConnectWithoutEntityInput[]
    createMany?: SmartSpaceMessageCreateManyEntityInputEnvelope
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
  }

  export type ClientUncheckedCreateNestedManyWithoutEntityInput = {
    create?: XOR<ClientCreateWithoutEntityInput, ClientUncheckedCreateWithoutEntityInput> | ClientCreateWithoutEntityInput[] | ClientUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: ClientCreateOrConnectWithoutEntityInput | ClientCreateOrConnectWithoutEntityInput[]
    createMany?: ClientCreateManyEntityInputEnvelope
    connect?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
  }

  export type EnumEntityTypeFieldUpdateOperationsInput = {
    set?: $Enums.EntityType
  }

  export type SmartSpaceMembershipUpdateManyWithoutEntityNestedInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutEntityInput, SmartSpaceMembershipUncheckedCreateWithoutEntityInput> | SmartSpaceMembershipCreateWithoutEntityInput[] | SmartSpaceMembershipUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutEntityInput | SmartSpaceMembershipCreateOrConnectWithoutEntityInput[]
    upsert?: SmartSpaceMembershipUpsertWithWhereUniqueWithoutEntityInput | SmartSpaceMembershipUpsertWithWhereUniqueWithoutEntityInput[]
    createMany?: SmartSpaceMembershipCreateManyEntityInputEnvelope
    set?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    disconnect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    delete?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    update?: SmartSpaceMembershipUpdateWithWhereUniqueWithoutEntityInput | SmartSpaceMembershipUpdateWithWhereUniqueWithoutEntityInput[]
    updateMany?: SmartSpaceMembershipUpdateManyWithWhereWithoutEntityInput | SmartSpaceMembershipUpdateManyWithWhereWithoutEntityInput[]
    deleteMany?: SmartSpaceMembershipScalarWhereInput | SmartSpaceMembershipScalarWhereInput[]
  }

  export type SmartSpaceMessageUpdateManyWithoutEntityNestedInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutEntityInput, SmartSpaceMessageUncheckedCreateWithoutEntityInput> | SmartSpaceMessageCreateWithoutEntityInput[] | SmartSpaceMessageUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutEntityInput | SmartSpaceMessageCreateOrConnectWithoutEntityInput[]
    upsert?: SmartSpaceMessageUpsertWithWhereUniqueWithoutEntityInput | SmartSpaceMessageUpsertWithWhereUniqueWithoutEntityInput[]
    createMany?: SmartSpaceMessageCreateManyEntityInputEnvelope
    set?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    disconnect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    delete?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    update?: SmartSpaceMessageUpdateWithWhereUniqueWithoutEntityInput | SmartSpaceMessageUpdateWithWhereUniqueWithoutEntityInput[]
    updateMany?: SmartSpaceMessageUpdateManyWithWhereWithoutEntityInput | SmartSpaceMessageUpdateManyWithWhereWithoutEntityInput[]
    deleteMany?: SmartSpaceMessageScalarWhereInput | SmartSpaceMessageScalarWhereInput[]
  }

  export type ClientUpdateManyWithoutEntityNestedInput = {
    create?: XOR<ClientCreateWithoutEntityInput, ClientUncheckedCreateWithoutEntityInput> | ClientCreateWithoutEntityInput[] | ClientUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: ClientCreateOrConnectWithoutEntityInput | ClientCreateOrConnectWithoutEntityInput[]
    upsert?: ClientUpsertWithWhereUniqueWithoutEntityInput | ClientUpsertWithWhereUniqueWithoutEntityInput[]
    createMany?: ClientCreateManyEntityInputEnvelope
    set?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    disconnect?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    delete?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    connect?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    update?: ClientUpdateWithWhereUniqueWithoutEntityInput | ClientUpdateWithWhereUniqueWithoutEntityInput[]
    updateMany?: ClientUpdateManyWithWhereWithoutEntityInput | ClientUpdateManyWithWhereWithoutEntityInput[]
    deleteMany?: ClientScalarWhereInput | ClientScalarWhereInput[]
  }

  export type SmartSpaceMembershipUncheckedUpdateManyWithoutEntityNestedInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutEntityInput, SmartSpaceMembershipUncheckedCreateWithoutEntityInput> | SmartSpaceMembershipCreateWithoutEntityInput[] | SmartSpaceMembershipUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutEntityInput | SmartSpaceMembershipCreateOrConnectWithoutEntityInput[]
    upsert?: SmartSpaceMembershipUpsertWithWhereUniqueWithoutEntityInput | SmartSpaceMembershipUpsertWithWhereUniqueWithoutEntityInput[]
    createMany?: SmartSpaceMembershipCreateManyEntityInputEnvelope
    set?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    disconnect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    delete?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    update?: SmartSpaceMembershipUpdateWithWhereUniqueWithoutEntityInput | SmartSpaceMembershipUpdateWithWhereUniqueWithoutEntityInput[]
    updateMany?: SmartSpaceMembershipUpdateManyWithWhereWithoutEntityInput | SmartSpaceMembershipUpdateManyWithWhereWithoutEntityInput[]
    deleteMany?: SmartSpaceMembershipScalarWhereInput | SmartSpaceMembershipScalarWhereInput[]
  }

  export type SmartSpaceMessageUncheckedUpdateManyWithoutEntityNestedInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutEntityInput, SmartSpaceMessageUncheckedCreateWithoutEntityInput> | SmartSpaceMessageCreateWithoutEntityInput[] | SmartSpaceMessageUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutEntityInput | SmartSpaceMessageCreateOrConnectWithoutEntityInput[]
    upsert?: SmartSpaceMessageUpsertWithWhereUniqueWithoutEntityInput | SmartSpaceMessageUpsertWithWhereUniqueWithoutEntityInput[]
    createMany?: SmartSpaceMessageCreateManyEntityInputEnvelope
    set?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    disconnect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    delete?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    update?: SmartSpaceMessageUpdateWithWhereUniqueWithoutEntityInput | SmartSpaceMessageUpdateWithWhereUniqueWithoutEntityInput[]
    updateMany?: SmartSpaceMessageUpdateManyWithWhereWithoutEntityInput | SmartSpaceMessageUpdateManyWithWhereWithoutEntityInput[]
    deleteMany?: SmartSpaceMessageScalarWhereInput | SmartSpaceMessageScalarWhereInput[]
  }

  export type ClientUncheckedUpdateManyWithoutEntityNestedInput = {
    create?: XOR<ClientCreateWithoutEntityInput, ClientUncheckedCreateWithoutEntityInput> | ClientCreateWithoutEntityInput[] | ClientUncheckedCreateWithoutEntityInput[]
    connectOrCreate?: ClientCreateOrConnectWithoutEntityInput | ClientCreateOrConnectWithoutEntityInput[]
    upsert?: ClientUpsertWithWhereUniqueWithoutEntityInput | ClientUpsertWithWhereUniqueWithoutEntityInput[]
    createMany?: ClientCreateManyEntityInputEnvelope
    set?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    disconnect?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    delete?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    connect?: ClientWhereUniqueInput | ClientWhereUniqueInput[]
    update?: ClientUpdateWithWhereUniqueWithoutEntityInput | ClientUpdateWithWhereUniqueWithoutEntityInput[]
    updateMany?: ClientUpdateManyWithWhereWithoutEntityInput | ClientUpdateManyWithWhereWithoutEntityInput[]
    deleteMany?: ClientScalarWhereInput | ClientScalarWhereInput[]
  }

  export type SmartSpaceMembershipCreateNestedManyWithoutSmartSpaceInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMembershipCreateWithoutSmartSpaceInput[] | SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMembershipCreateManySmartSpaceInputEnvelope
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
  }

  export type SmartSpaceMessageCreateNestedManyWithoutSmartSpaceInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMessageCreateWithoutSmartSpaceInput[] | SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMessageCreateManySmartSpaceInputEnvelope
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
  }

  export type SmartSpaceMembershipUncheckedCreateNestedManyWithoutSmartSpaceInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMembershipCreateWithoutSmartSpaceInput[] | SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMembershipCreateManySmartSpaceInputEnvelope
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
  }

  export type SmartSpaceMessageUncheckedCreateNestedManyWithoutSmartSpaceInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMessageCreateWithoutSmartSpaceInput[] | SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMessageCreateManySmartSpaceInputEnvelope
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
  }

  export type SmartSpaceMembershipUpdateManyWithoutSmartSpaceNestedInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMembershipCreateWithoutSmartSpaceInput[] | SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput[]
    upsert?: SmartSpaceMembershipUpsertWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMembershipUpsertWithWhereUniqueWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMembershipCreateManySmartSpaceInputEnvelope
    set?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    disconnect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    delete?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    update?: SmartSpaceMembershipUpdateWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMembershipUpdateWithWhereUniqueWithoutSmartSpaceInput[]
    updateMany?: SmartSpaceMembershipUpdateManyWithWhereWithoutSmartSpaceInput | SmartSpaceMembershipUpdateManyWithWhereWithoutSmartSpaceInput[]
    deleteMany?: SmartSpaceMembershipScalarWhereInput | SmartSpaceMembershipScalarWhereInput[]
  }

  export type SmartSpaceMessageUpdateManyWithoutSmartSpaceNestedInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMessageCreateWithoutSmartSpaceInput[] | SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput[]
    upsert?: SmartSpaceMessageUpsertWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMessageUpsertWithWhereUniqueWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMessageCreateManySmartSpaceInputEnvelope
    set?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    disconnect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    delete?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    update?: SmartSpaceMessageUpdateWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMessageUpdateWithWhereUniqueWithoutSmartSpaceInput[]
    updateMany?: SmartSpaceMessageUpdateManyWithWhereWithoutSmartSpaceInput | SmartSpaceMessageUpdateManyWithWhereWithoutSmartSpaceInput[]
    deleteMany?: SmartSpaceMessageScalarWhereInput | SmartSpaceMessageScalarWhereInput[]
  }

  export type SmartSpaceMembershipUncheckedUpdateManyWithoutSmartSpaceNestedInput = {
    create?: XOR<SmartSpaceMembershipCreateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMembershipCreateWithoutSmartSpaceInput[] | SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput[]
    upsert?: SmartSpaceMembershipUpsertWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMembershipUpsertWithWhereUniqueWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMembershipCreateManySmartSpaceInputEnvelope
    set?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    disconnect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    delete?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    connect?: SmartSpaceMembershipWhereUniqueInput | SmartSpaceMembershipWhereUniqueInput[]
    update?: SmartSpaceMembershipUpdateWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMembershipUpdateWithWhereUniqueWithoutSmartSpaceInput[]
    updateMany?: SmartSpaceMembershipUpdateManyWithWhereWithoutSmartSpaceInput | SmartSpaceMembershipUpdateManyWithWhereWithoutSmartSpaceInput[]
    deleteMany?: SmartSpaceMembershipScalarWhereInput | SmartSpaceMembershipScalarWhereInput[]
  }

  export type SmartSpaceMessageUncheckedUpdateManyWithoutSmartSpaceNestedInput = {
    create?: XOR<SmartSpaceMessageCreateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput> | SmartSpaceMessageCreateWithoutSmartSpaceInput[] | SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput[]
    connectOrCreate?: SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput | SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput[]
    upsert?: SmartSpaceMessageUpsertWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMessageUpsertWithWhereUniqueWithoutSmartSpaceInput[]
    createMany?: SmartSpaceMessageCreateManySmartSpaceInputEnvelope
    set?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    disconnect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    delete?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    connect?: SmartSpaceMessageWhereUniqueInput | SmartSpaceMessageWhereUniqueInput[]
    update?: SmartSpaceMessageUpdateWithWhereUniqueWithoutSmartSpaceInput | SmartSpaceMessageUpdateWithWhereUniqueWithoutSmartSpaceInput[]
    updateMany?: SmartSpaceMessageUpdateManyWithWhereWithoutSmartSpaceInput | SmartSpaceMessageUpdateManyWithWhereWithoutSmartSpaceInput[]
    deleteMany?: SmartSpaceMessageScalarWhereInput | SmartSpaceMessageScalarWhereInput[]
  }

  export type SmartSpaceCreateNestedOneWithoutMembershipsInput = {
    create?: XOR<SmartSpaceCreateWithoutMembershipsInput, SmartSpaceUncheckedCreateWithoutMembershipsInput>
    connectOrCreate?: SmartSpaceCreateOrConnectWithoutMembershipsInput
    connect?: SmartSpaceWhereUniqueInput
  }

  export type EntityCreateNestedOneWithoutSmartSpaceMembershipsInput = {
    create?: XOR<EntityCreateWithoutSmartSpaceMembershipsInput, EntityUncheckedCreateWithoutSmartSpaceMembershipsInput>
    connectOrCreate?: EntityCreateOrConnectWithoutSmartSpaceMembershipsInput
    connect?: EntityWhereUniqueInput
  }

  export type SmartSpaceUpdateOneRequiredWithoutMembershipsNestedInput = {
    create?: XOR<SmartSpaceCreateWithoutMembershipsInput, SmartSpaceUncheckedCreateWithoutMembershipsInput>
    connectOrCreate?: SmartSpaceCreateOrConnectWithoutMembershipsInput
    upsert?: SmartSpaceUpsertWithoutMembershipsInput
    connect?: SmartSpaceWhereUniqueInput
    update?: XOR<XOR<SmartSpaceUpdateToOneWithWhereWithoutMembershipsInput, SmartSpaceUpdateWithoutMembershipsInput>, SmartSpaceUncheckedUpdateWithoutMembershipsInput>
  }

  export type EntityUpdateOneRequiredWithoutSmartSpaceMembershipsNestedInput = {
    create?: XOR<EntityCreateWithoutSmartSpaceMembershipsInput, EntityUncheckedCreateWithoutSmartSpaceMembershipsInput>
    connectOrCreate?: EntityCreateOrConnectWithoutSmartSpaceMembershipsInput
    upsert?: EntityUpsertWithoutSmartSpaceMembershipsInput
    connect?: EntityWhereUniqueInput
    update?: XOR<XOR<EntityUpdateToOneWithWhereWithoutSmartSpaceMembershipsInput, EntityUpdateWithoutSmartSpaceMembershipsInput>, EntityUncheckedUpdateWithoutSmartSpaceMembershipsInput>
  }

  export type SmartSpaceCreateNestedOneWithoutMessagesInput = {
    create?: XOR<SmartSpaceCreateWithoutMessagesInput, SmartSpaceUncheckedCreateWithoutMessagesInput>
    connectOrCreate?: SmartSpaceCreateOrConnectWithoutMessagesInput
    connect?: SmartSpaceWhereUniqueInput
  }

  export type EntityCreateNestedOneWithoutMessagesInput = {
    create?: XOR<EntityCreateWithoutMessagesInput, EntityUncheckedCreateWithoutMessagesInput>
    connectOrCreate?: EntityCreateOrConnectWithoutMessagesInput
    connect?: EntityWhereUniqueInput
  }

  export type BigIntFieldUpdateOperationsInput = {
    set?: bigint | number
    increment?: bigint | number
    decrement?: bigint | number
    multiply?: bigint | number
    divide?: bigint | number
  }

  export type SmartSpaceUpdateOneRequiredWithoutMessagesNestedInput = {
    create?: XOR<SmartSpaceCreateWithoutMessagesInput, SmartSpaceUncheckedCreateWithoutMessagesInput>
    connectOrCreate?: SmartSpaceCreateOrConnectWithoutMessagesInput
    upsert?: SmartSpaceUpsertWithoutMessagesInput
    connect?: SmartSpaceWhereUniqueInput
    update?: XOR<XOR<SmartSpaceUpdateToOneWithWhereWithoutMessagesInput, SmartSpaceUpdateWithoutMessagesInput>, SmartSpaceUncheckedUpdateWithoutMessagesInput>
  }

  export type EntityUpdateOneRequiredWithoutMessagesNestedInput = {
    create?: XOR<EntityCreateWithoutMessagesInput, EntityUncheckedCreateWithoutMessagesInput>
    connectOrCreate?: EntityCreateOrConnectWithoutMessagesInput
    upsert?: EntityUpsertWithoutMessagesInput
    connect?: EntityWhereUniqueInput
    update?: XOR<XOR<EntityUpdateToOneWithWhereWithoutMessagesInput, EntityUpdateWithoutMessagesInput>, EntityUncheckedUpdateWithoutMessagesInput>
  }

  export type EntityCreateNestedOneWithoutClientsInput = {
    create?: XOR<EntityCreateWithoutClientsInput, EntityUncheckedCreateWithoutClientsInput>
    connectOrCreate?: EntityCreateOrConnectWithoutClientsInput
    connect?: EntityWhereUniqueInput
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type EntityUpdateOneRequiredWithoutClientsNestedInput = {
    create?: XOR<EntityCreateWithoutClientsInput, EntityUncheckedCreateWithoutClientsInput>
    connectOrCreate?: EntityCreateOrConnectWithoutClientsInput
    upsert?: EntityUpsertWithoutClientsInput
    connect?: EntityWhereUniqueInput
    update?: XOR<XOR<EntityUpdateToOneWithWhereWithoutClientsInput, EntityUpdateWithoutClientsInput>, EntityUncheckedUpdateWithoutClientsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedUuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type NestedEnumEntityTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.EntityType | EnumEntityTypeFieldRefInput<$PrismaModel>
    in?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumEntityTypeFilter<$PrismaModel> | $Enums.EntityType
  }

  export type NestedUuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedEnumEntityTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.EntityType | EnumEntityTypeFieldRefInput<$PrismaModel>
    in?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.EntityType[] | ListEnumEntityTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumEntityTypeWithAggregatesFilter<$PrismaModel> | $Enums.EntityType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumEntityTypeFilter<$PrismaModel>
    _max?: NestedEnumEntityTypeFilter<$PrismaModel>
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedUuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }

  export type NestedUuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedBigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type NestedBigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type SmartSpaceMembershipCreateWithoutEntityInput = {
    id?: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
    smartSpace: SmartSpaceCreateNestedOneWithoutMembershipsInput
  }

  export type SmartSpaceMembershipUncheckedCreateWithoutEntityInput = {
    id?: string
    smartSpaceId: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
  }

  export type SmartSpaceMembershipCreateOrConnectWithoutEntityInput = {
    where: SmartSpaceMembershipWhereUniqueInput
    create: XOR<SmartSpaceMembershipCreateWithoutEntityInput, SmartSpaceMembershipUncheckedCreateWithoutEntityInput>
  }

  export type SmartSpaceMembershipCreateManyEntityInputEnvelope = {
    data: SmartSpaceMembershipCreateManyEntityInput | SmartSpaceMembershipCreateManyEntityInput[]
    skipDuplicates?: boolean
  }

  export type SmartSpaceMessageCreateWithoutEntityInput = {
    id?: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
    smartSpace: SmartSpaceCreateNestedOneWithoutMessagesInput
  }

  export type SmartSpaceMessageUncheckedCreateWithoutEntityInput = {
    id?: string
    smartSpaceId: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
  }

  export type SmartSpaceMessageCreateOrConnectWithoutEntityInput = {
    where: SmartSpaceMessageWhereUniqueInput
    create: XOR<SmartSpaceMessageCreateWithoutEntityInput, SmartSpaceMessageUncheckedCreateWithoutEntityInput>
  }

  export type SmartSpaceMessageCreateManyEntityInputEnvelope = {
    data: SmartSpaceMessageCreateManyEntityInput | SmartSpaceMessageCreateManyEntityInput[]
    skipDuplicates?: boolean
  }

  export type ClientCreateWithoutEntityInput = {
    id?: string
    clientKey: string
    clientType?: string | null
    displayName?: string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    lastSeenAt?: Date | string | null
  }

  export type ClientUncheckedCreateWithoutEntityInput = {
    id?: string
    clientKey: string
    clientType?: string | null
    displayName?: string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    lastSeenAt?: Date | string | null
  }

  export type ClientCreateOrConnectWithoutEntityInput = {
    where: ClientWhereUniqueInput
    create: XOR<ClientCreateWithoutEntityInput, ClientUncheckedCreateWithoutEntityInput>
  }

  export type ClientCreateManyEntityInputEnvelope = {
    data: ClientCreateManyEntityInput | ClientCreateManyEntityInput[]
    skipDuplicates?: boolean
  }

  export type SmartSpaceMembershipUpsertWithWhereUniqueWithoutEntityInput = {
    where: SmartSpaceMembershipWhereUniqueInput
    update: XOR<SmartSpaceMembershipUpdateWithoutEntityInput, SmartSpaceMembershipUncheckedUpdateWithoutEntityInput>
    create: XOR<SmartSpaceMembershipCreateWithoutEntityInput, SmartSpaceMembershipUncheckedCreateWithoutEntityInput>
  }

  export type SmartSpaceMembershipUpdateWithWhereUniqueWithoutEntityInput = {
    where: SmartSpaceMembershipWhereUniqueInput
    data: XOR<SmartSpaceMembershipUpdateWithoutEntityInput, SmartSpaceMembershipUncheckedUpdateWithoutEntityInput>
  }

  export type SmartSpaceMembershipUpdateManyWithWhereWithoutEntityInput = {
    where: SmartSpaceMembershipScalarWhereInput
    data: XOR<SmartSpaceMembershipUpdateManyMutationInput, SmartSpaceMembershipUncheckedUpdateManyWithoutEntityInput>
  }

  export type SmartSpaceMembershipScalarWhereInput = {
    AND?: SmartSpaceMembershipScalarWhereInput | SmartSpaceMembershipScalarWhereInput[]
    OR?: SmartSpaceMembershipScalarWhereInput[]
    NOT?: SmartSpaceMembershipScalarWhereInput | SmartSpaceMembershipScalarWhereInput[]
    id?: UuidFilter<"SmartSpaceMembership"> | string
    smartSpaceId?: UuidFilter<"SmartSpaceMembership"> | string
    entityId?: UuidFilter<"SmartSpaceMembership"> | string
    role?: StringNullableFilter<"SmartSpaceMembership"> | string | null
    joinedAt?: DateTimeFilter<"SmartSpaceMembership"> | Date | string
    lastSeenMessageId?: UuidNullableFilter<"SmartSpaceMembership"> | string | null
  }

  export type SmartSpaceMessageUpsertWithWhereUniqueWithoutEntityInput = {
    where: SmartSpaceMessageWhereUniqueInput
    update: XOR<SmartSpaceMessageUpdateWithoutEntityInput, SmartSpaceMessageUncheckedUpdateWithoutEntityInput>
    create: XOR<SmartSpaceMessageCreateWithoutEntityInput, SmartSpaceMessageUncheckedCreateWithoutEntityInput>
  }

  export type SmartSpaceMessageUpdateWithWhereUniqueWithoutEntityInput = {
    where: SmartSpaceMessageWhereUniqueInput
    data: XOR<SmartSpaceMessageUpdateWithoutEntityInput, SmartSpaceMessageUncheckedUpdateWithoutEntityInput>
  }

  export type SmartSpaceMessageUpdateManyWithWhereWithoutEntityInput = {
    where: SmartSpaceMessageScalarWhereInput
    data: XOR<SmartSpaceMessageUpdateManyMutationInput, SmartSpaceMessageUncheckedUpdateManyWithoutEntityInput>
  }

  export type SmartSpaceMessageScalarWhereInput = {
    AND?: SmartSpaceMessageScalarWhereInput | SmartSpaceMessageScalarWhereInput[]
    OR?: SmartSpaceMessageScalarWhereInput[]
    NOT?: SmartSpaceMessageScalarWhereInput | SmartSpaceMessageScalarWhereInput[]
    id?: UuidFilter<"SmartSpaceMessage"> | string
    smartSpaceId?: UuidFilter<"SmartSpaceMessage"> | string
    entityId?: UuidFilter<"SmartSpaceMessage"> | string
    role?: StringFilter<"SmartSpaceMessage"> | string
    content?: StringNullableFilter<"SmartSpaceMessage"> | string | null
    metadata?: JsonNullableFilter<"SmartSpaceMessage">
    seq?: BigIntFilter<"SmartSpaceMessage"> | bigint | number
    createdAt?: DateTimeFilter<"SmartSpaceMessage"> | Date | string
  }

  export type ClientUpsertWithWhereUniqueWithoutEntityInput = {
    where: ClientWhereUniqueInput
    update: XOR<ClientUpdateWithoutEntityInput, ClientUncheckedUpdateWithoutEntityInput>
    create: XOR<ClientCreateWithoutEntityInput, ClientUncheckedCreateWithoutEntityInput>
  }

  export type ClientUpdateWithWhereUniqueWithoutEntityInput = {
    where: ClientWhereUniqueInput
    data: XOR<ClientUpdateWithoutEntityInput, ClientUncheckedUpdateWithoutEntityInput>
  }

  export type ClientUpdateManyWithWhereWithoutEntityInput = {
    where: ClientScalarWhereInput
    data: XOR<ClientUpdateManyMutationInput, ClientUncheckedUpdateManyWithoutEntityInput>
  }

  export type ClientScalarWhereInput = {
    AND?: ClientScalarWhereInput | ClientScalarWhereInput[]
    OR?: ClientScalarWhereInput[]
    NOT?: ClientScalarWhereInput | ClientScalarWhereInput[]
    id?: UuidFilter<"Client"> | string
    entityId?: UuidFilter<"Client"> | string
    clientKey?: StringFilter<"Client"> | string
    clientType?: StringNullableFilter<"Client"> | string | null
    displayName?: StringNullableFilter<"Client"> | string | null
    capabilities?: JsonFilter<"Client">
    createdAt?: DateTimeFilter<"Client"> | Date | string
    lastSeenAt?: DateTimeNullableFilter<"Client"> | Date | string | null
  }

  export type SmartSpaceMembershipCreateWithoutSmartSpaceInput = {
    id?: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
    entity: EntityCreateNestedOneWithoutSmartSpaceMembershipsInput
  }

  export type SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput = {
    id?: string
    entityId: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
  }

  export type SmartSpaceMembershipCreateOrConnectWithoutSmartSpaceInput = {
    where: SmartSpaceMembershipWhereUniqueInput
    create: XOR<SmartSpaceMembershipCreateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput>
  }

  export type SmartSpaceMembershipCreateManySmartSpaceInputEnvelope = {
    data: SmartSpaceMembershipCreateManySmartSpaceInput | SmartSpaceMembershipCreateManySmartSpaceInput[]
    skipDuplicates?: boolean
  }

  export type SmartSpaceMessageCreateWithoutSmartSpaceInput = {
    id?: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
    entity: EntityCreateNestedOneWithoutMessagesInput
  }

  export type SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput = {
    id?: string
    entityId: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
  }

  export type SmartSpaceMessageCreateOrConnectWithoutSmartSpaceInput = {
    where: SmartSpaceMessageWhereUniqueInput
    create: XOR<SmartSpaceMessageCreateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput>
  }

  export type SmartSpaceMessageCreateManySmartSpaceInputEnvelope = {
    data: SmartSpaceMessageCreateManySmartSpaceInput | SmartSpaceMessageCreateManySmartSpaceInput[]
    skipDuplicates?: boolean
  }

  export type SmartSpaceMembershipUpsertWithWhereUniqueWithoutSmartSpaceInput = {
    where: SmartSpaceMembershipWhereUniqueInput
    update: XOR<SmartSpaceMembershipUpdateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedUpdateWithoutSmartSpaceInput>
    create: XOR<SmartSpaceMembershipCreateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedCreateWithoutSmartSpaceInput>
  }

  export type SmartSpaceMembershipUpdateWithWhereUniqueWithoutSmartSpaceInput = {
    where: SmartSpaceMembershipWhereUniqueInput
    data: XOR<SmartSpaceMembershipUpdateWithoutSmartSpaceInput, SmartSpaceMembershipUncheckedUpdateWithoutSmartSpaceInput>
  }

  export type SmartSpaceMembershipUpdateManyWithWhereWithoutSmartSpaceInput = {
    where: SmartSpaceMembershipScalarWhereInput
    data: XOR<SmartSpaceMembershipUpdateManyMutationInput, SmartSpaceMembershipUncheckedUpdateManyWithoutSmartSpaceInput>
  }

  export type SmartSpaceMessageUpsertWithWhereUniqueWithoutSmartSpaceInput = {
    where: SmartSpaceMessageWhereUniqueInput
    update: XOR<SmartSpaceMessageUpdateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedUpdateWithoutSmartSpaceInput>
    create: XOR<SmartSpaceMessageCreateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedCreateWithoutSmartSpaceInput>
  }

  export type SmartSpaceMessageUpdateWithWhereUniqueWithoutSmartSpaceInput = {
    where: SmartSpaceMessageWhereUniqueInput
    data: XOR<SmartSpaceMessageUpdateWithoutSmartSpaceInput, SmartSpaceMessageUncheckedUpdateWithoutSmartSpaceInput>
  }

  export type SmartSpaceMessageUpdateManyWithWhereWithoutSmartSpaceInput = {
    where: SmartSpaceMessageScalarWhereInput
    data: XOR<SmartSpaceMessageUpdateManyMutationInput, SmartSpaceMessageUncheckedUpdateManyWithoutSmartSpaceInput>
  }

  export type SmartSpaceCreateWithoutMembershipsInput = {
    id?: string
    name?: string | null
    description?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    messages?: SmartSpaceMessageCreateNestedManyWithoutSmartSpaceInput
  }

  export type SmartSpaceUncheckedCreateWithoutMembershipsInput = {
    id?: string
    name?: string | null
    description?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    messages?: SmartSpaceMessageUncheckedCreateNestedManyWithoutSmartSpaceInput
  }

  export type SmartSpaceCreateOrConnectWithoutMembershipsInput = {
    where: SmartSpaceWhereUniqueInput
    create: XOR<SmartSpaceCreateWithoutMembershipsInput, SmartSpaceUncheckedCreateWithoutMembershipsInput>
  }

  export type EntityCreateWithoutSmartSpaceMembershipsInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    messages?: SmartSpaceMessageCreateNestedManyWithoutEntityInput
    clients?: ClientCreateNestedManyWithoutEntityInput
  }

  export type EntityUncheckedCreateWithoutSmartSpaceMembershipsInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    messages?: SmartSpaceMessageUncheckedCreateNestedManyWithoutEntityInput
    clients?: ClientUncheckedCreateNestedManyWithoutEntityInput
  }

  export type EntityCreateOrConnectWithoutSmartSpaceMembershipsInput = {
    where: EntityWhereUniqueInput
    create: XOR<EntityCreateWithoutSmartSpaceMembershipsInput, EntityUncheckedCreateWithoutSmartSpaceMembershipsInput>
  }

  export type SmartSpaceUpsertWithoutMembershipsInput = {
    update: XOR<SmartSpaceUpdateWithoutMembershipsInput, SmartSpaceUncheckedUpdateWithoutMembershipsInput>
    create: XOR<SmartSpaceCreateWithoutMembershipsInput, SmartSpaceUncheckedCreateWithoutMembershipsInput>
    where?: SmartSpaceWhereInput
  }

  export type SmartSpaceUpdateToOneWithWhereWithoutMembershipsInput = {
    where?: SmartSpaceWhereInput
    data: XOR<SmartSpaceUpdateWithoutMembershipsInput, SmartSpaceUncheckedUpdateWithoutMembershipsInput>
  }

  export type SmartSpaceUpdateWithoutMembershipsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    messages?: SmartSpaceMessageUpdateManyWithoutSmartSpaceNestedInput
  }

  export type SmartSpaceUncheckedUpdateWithoutMembershipsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    messages?: SmartSpaceMessageUncheckedUpdateManyWithoutSmartSpaceNestedInput
  }

  export type EntityUpsertWithoutSmartSpaceMembershipsInput = {
    update: XOR<EntityUpdateWithoutSmartSpaceMembershipsInput, EntityUncheckedUpdateWithoutSmartSpaceMembershipsInput>
    create: XOR<EntityCreateWithoutSmartSpaceMembershipsInput, EntityUncheckedCreateWithoutSmartSpaceMembershipsInput>
    where?: EntityWhereInput
  }

  export type EntityUpdateToOneWithWhereWithoutSmartSpaceMembershipsInput = {
    where?: EntityWhereInput
    data: XOR<EntityUpdateWithoutSmartSpaceMembershipsInput, EntityUncheckedUpdateWithoutSmartSpaceMembershipsInput>
  }

  export type EntityUpdateWithoutSmartSpaceMembershipsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    messages?: SmartSpaceMessageUpdateManyWithoutEntityNestedInput
    clients?: ClientUpdateManyWithoutEntityNestedInput
  }

  export type EntityUncheckedUpdateWithoutSmartSpaceMembershipsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    messages?: SmartSpaceMessageUncheckedUpdateManyWithoutEntityNestedInput
    clients?: ClientUncheckedUpdateManyWithoutEntityNestedInput
  }

  export type SmartSpaceCreateWithoutMessagesInput = {
    id?: string
    name?: string | null
    description?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    memberships?: SmartSpaceMembershipCreateNestedManyWithoutSmartSpaceInput
  }

  export type SmartSpaceUncheckedCreateWithoutMessagesInput = {
    id?: string
    name?: string | null
    description?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    memberships?: SmartSpaceMembershipUncheckedCreateNestedManyWithoutSmartSpaceInput
  }

  export type SmartSpaceCreateOrConnectWithoutMessagesInput = {
    where: SmartSpaceWhereUniqueInput
    create: XOR<SmartSpaceCreateWithoutMessagesInput, SmartSpaceUncheckedCreateWithoutMessagesInput>
  }

  export type EntityCreateWithoutMessagesInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    smartSpaceMemberships?: SmartSpaceMembershipCreateNestedManyWithoutEntityInput
    clients?: ClientCreateNestedManyWithoutEntityInput
  }

  export type EntityUncheckedCreateWithoutMessagesInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUncheckedCreateNestedManyWithoutEntityInput
    clients?: ClientUncheckedCreateNestedManyWithoutEntityInput
  }

  export type EntityCreateOrConnectWithoutMessagesInput = {
    where: EntityWhereUniqueInput
    create: XOR<EntityCreateWithoutMessagesInput, EntityUncheckedCreateWithoutMessagesInput>
  }

  export type SmartSpaceUpsertWithoutMessagesInput = {
    update: XOR<SmartSpaceUpdateWithoutMessagesInput, SmartSpaceUncheckedUpdateWithoutMessagesInput>
    create: XOR<SmartSpaceCreateWithoutMessagesInput, SmartSpaceUncheckedCreateWithoutMessagesInput>
    where?: SmartSpaceWhereInput
  }

  export type SmartSpaceUpdateToOneWithWhereWithoutMessagesInput = {
    where?: SmartSpaceWhereInput
    data: XOR<SmartSpaceUpdateWithoutMessagesInput, SmartSpaceUncheckedUpdateWithoutMessagesInput>
  }

  export type SmartSpaceUpdateWithoutMessagesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    memberships?: SmartSpaceMembershipUpdateManyWithoutSmartSpaceNestedInput
  }

  export type SmartSpaceUncheckedUpdateWithoutMessagesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    description?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    memberships?: SmartSpaceMembershipUncheckedUpdateManyWithoutSmartSpaceNestedInput
  }

  export type EntityUpsertWithoutMessagesInput = {
    update: XOR<EntityUpdateWithoutMessagesInput, EntityUncheckedUpdateWithoutMessagesInput>
    create: XOR<EntityCreateWithoutMessagesInput, EntityUncheckedCreateWithoutMessagesInput>
    where?: EntityWhereInput
  }

  export type EntityUpdateToOneWithWhereWithoutMessagesInput = {
    where?: EntityWhereInput
    data: XOR<EntityUpdateWithoutMessagesInput, EntityUncheckedUpdateWithoutMessagesInput>
  }

  export type EntityUpdateWithoutMessagesInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUpdateManyWithoutEntityNestedInput
    clients?: ClientUpdateManyWithoutEntityNestedInput
  }

  export type EntityUncheckedUpdateWithoutMessagesInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUncheckedUpdateManyWithoutEntityNestedInput
    clients?: ClientUncheckedUpdateManyWithoutEntityNestedInput
  }

  export type EntityCreateWithoutClientsInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    smartSpaceMemberships?: SmartSpaceMembershipCreateNestedManyWithoutEntityInput
    messages?: SmartSpaceMessageCreateNestedManyWithoutEntityInput
  }

  export type EntityUncheckedCreateWithoutClientsInput = {
    id: string
    type: $Enums.EntityType
    externalId?: string | null
    displayName?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUncheckedCreateNestedManyWithoutEntityInput
    messages?: SmartSpaceMessageUncheckedCreateNestedManyWithoutEntityInput
  }

  export type EntityCreateOrConnectWithoutClientsInput = {
    where: EntityWhereUniqueInput
    create: XOR<EntityCreateWithoutClientsInput, EntityUncheckedCreateWithoutClientsInput>
  }

  export type EntityUpsertWithoutClientsInput = {
    update: XOR<EntityUpdateWithoutClientsInput, EntityUncheckedUpdateWithoutClientsInput>
    create: XOR<EntityCreateWithoutClientsInput, EntityUncheckedCreateWithoutClientsInput>
    where?: EntityWhereInput
  }

  export type EntityUpdateToOneWithWhereWithoutClientsInput = {
    where?: EntityWhereInput
    data: XOR<EntityUpdateWithoutClientsInput, EntityUncheckedUpdateWithoutClientsInput>
  }

  export type EntityUpdateWithoutClientsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUpdateManyWithoutEntityNestedInput
    messages?: SmartSpaceMessageUpdateManyWithoutEntityNestedInput
  }

  export type EntityUncheckedUpdateWithoutClientsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumEntityTypeFieldUpdateOperationsInput | $Enums.EntityType
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpaceMemberships?: SmartSpaceMembershipUncheckedUpdateManyWithoutEntityNestedInput
    messages?: SmartSpaceMessageUncheckedUpdateManyWithoutEntityNestedInput
  }

  export type SmartSpaceMembershipCreateManyEntityInput = {
    id?: string
    smartSpaceId: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
  }

  export type SmartSpaceMessageCreateManyEntityInput = {
    id?: string
    smartSpaceId: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
  }

  export type ClientCreateManyEntityInput = {
    id?: string
    clientKey: string
    clientType?: string | null
    displayName?: string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    lastSeenAt?: Date | string | null
  }

  export type SmartSpaceMembershipUpdateWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
    smartSpace?: SmartSpaceUpdateOneRequiredWithoutMembershipsNestedInput
  }

  export type SmartSpaceMembershipUncheckedUpdateWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SmartSpaceMembershipUncheckedUpdateManyWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SmartSpaceMessageUpdateWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    smartSpace?: SmartSpaceUpdateOneRequiredWithoutMessagesNestedInput
  }

  export type SmartSpaceMessageUncheckedUpdateWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SmartSpaceMessageUncheckedUpdateManyWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    smartSpaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ClientUpdateWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    clientKey?: StringFieldUpdateOperationsInput | string
    clientType?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ClientUncheckedUpdateWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    clientKey?: StringFieldUpdateOperationsInput | string
    clientType?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ClientUncheckedUpdateManyWithoutEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    clientKey?: StringFieldUpdateOperationsInput | string
    clientType?: NullableStringFieldUpdateOperationsInput | string | null
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    capabilities?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SmartSpaceMembershipCreateManySmartSpaceInput = {
    id?: string
    entityId: string
    role?: string | null
    joinedAt?: Date | string
    lastSeenMessageId?: string | null
  }

  export type SmartSpaceMessageCreateManySmartSpaceInput = {
    id?: string
    entityId: string
    role: string
    content?: string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq: bigint | number
    createdAt?: Date | string
  }

  export type SmartSpaceMembershipUpdateWithoutSmartSpaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
    entity?: EntityUpdateOneRequiredWithoutSmartSpaceMembershipsNestedInput
  }

  export type SmartSpaceMembershipUncheckedUpdateWithoutSmartSpaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SmartSpaceMembershipUncheckedUpdateManyWithoutSmartSpaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: NullableStringFieldUpdateOperationsInput | string | null
    joinedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    lastSeenMessageId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SmartSpaceMessageUpdateWithoutSmartSpaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    entity?: EntityUpdateOneRequiredWithoutMessagesNestedInput
  }

  export type SmartSpaceMessageUncheckedUpdateWithoutSmartSpaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SmartSpaceMessageUncheckedUpdateManyWithoutSmartSpaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    entityId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    content?: NullableStringFieldUpdateOperationsInput | string | null
    metadata?: NullableJsonNullValueInput | InputJsonValue
    seq?: BigIntFieldUpdateOperationsInput | bigint | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}