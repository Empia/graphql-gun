/* global describe, it, expect */
const gql = require("graphql-tag");
let Gun = require("gun/gun");
const graphqlGun = require("./");

let gun = Gun();

async function testGraphqlGunWith(input, query, mutationGenerator=function*(){yield}) {
  delete require.cache[require.resolve('gun/gun')]
  Gun = require("gun/gun");
  gun = Gun();

  Object.keys(input).map((top) => {
    gun.get(top).put(input[top]);
  });

  let { next } = graphqlGun( query, gun );
  let lastResult;

  const iter = mutationGenerator()
  while (!(iter.next(lastResult=(await next()))).done) {
    expect(lastResult).toMatchSnapshot();
  }
}

describe("graphqlGun", () => {
  it("can do the basics", async () => {
    await testGraphqlGunWith({
      foo: {
        bar: "baz"
      }
    }, gql`{
      foo {
        bar
      }
    }`);
  });

  it("lets you grab the chain at any point", async () => {
    await testGraphqlGunWith({
      grab: {
        bar: { some: "foo" }
      }
    }, gql`{
        grab {
          _chain
          bar @live {
            some
          }
        }
    }`, function*() {
      let lastResult = yield;
      lastResult.grab._chain.get('bar').put({some: 'stuff'});
      yield
    })
  });

  it("iterates over sets", async () => {

    await testGraphqlGunWith({
      thing1: { stuff: "b", more: "ok" },
      thing2: { stuff: "c", more: "ok" },
      sets: { }
    }, gql`{
      thing1 {
        _chain
      }
      thing2 {
        _chain
      }
      _chain
      sets(type: Set) @live {
        stuff
      }
    }`, function*() {
      let lastResult = yield;
      const { _chain, thing1, thing2 } = lastResult;
      _chain.get('sets').set(thing1._chain);
      _chain.get('sets').set(thing2._chain);
      yield
    })
  });

  it("lets you subscribe to updates", async () => {
    const thing1 = gun.get("thing1");
    const thing2 = gun.get("thing2");
    thing1.put({ stuff: "b", more: "ok" });
    thing2.put({ stuff: "c", more: "ok" });
    gun.get("things").set(thing1);
    gun.get("things").set(thing2);

    let { next } = graphqlGun(
      gql`{
        things(type: Set) {
          stuff @live
        }
      }`,
      gun
    );

    expect(await next()).toEqual({ things: [{ stuff: "b" }, { stuff: "c" }] });

    gun.get("thing1").put({ stuff: "changed" });

    expect(await next()).toEqual({
      things: [{ stuff: "changed" }, { stuff: "c" }]
    });
  });

  xit("lets you unsubscribe to a subselection", async () => {
    const thing1 = gun.get("thing1");
    const thing2 = gun.get("thing2");
    thing1.put({ stuff: {
      subscribed: "uh oh",
      once: {
        one: "orig value",
        two: "weird"
      }
    }, more: "ok" });
    thing2.put({ stuff: "c", more: "ok" });
    gun.get("things").set(thing1);
    gun.get("things").set(thing2);

    let { next } = graphqlGun(
      gql`{
        things(type: Set) {
          stuff @live {
            subscribed
            once {
              one
              two
            }
          }
        }
      }`,
      gun
    );

    expect(await next()).toMatchSnapshot();

    gun.get("thing1").get("stuff").put({
      subscribed: "changed!",
      once: {
        one: "that shouldn't happen",
        two: "resubscribed!"
      }
    });

    expect(await next()).toEqual({
      things: [{ stuff: {
        subscribed: "changed!",
        once: {
          one: "orig value",
          two: "resubscribed"
        }
      }}, { stuff: "c" }]
    });
  });
});
