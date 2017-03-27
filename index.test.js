/* global describe, it, expect */
const gql = require("graphql-tag");
const Gun = require("gun/gun");
const graphqlGun = require("./");

const gun = Gun();

describe("graphqlGun", () => {
  it("can do the basics", async () => {
    gun.get("foo").put({ bar: "baz" });

    expect(
      await graphqlGun(
        gql`{
          foo {
            bar {
              baz
            }
          }
        }`,
        gun
      )
    ).toMatchSnapshot();
  });

  it("lets you grab the chain at any point", async () => {
    gun.get("foo").put({ bar: "pop" });

    const results = await graphqlGun(
      gql`{
        foo {
          bar {
            _chain
            hello
          }
        }
      }`,
      gun
    );

    expect(results).toMatchSnapshot();

    await new Promise(resolve => {
      results.foo.bar._chain.on(
        (value, key) => {
          expect(key).toEqual("bar");
          expect(value).toEqual("pop");
          resolve();
        },
        { changed: true }
      );

      gun.get("foo").get("bar").put({ some: "stuff" });
    });
  });

  it("iterates over sets", async () => {
    await new Promise(resolve => {
      const thing1 = gun.get("thing1");
      thing1.put({ stuff: "b", more: "ok" });
      gun.get("things").set(thing1, resolve);
    });
    await new Promise(resolve => {
      const thing2 = gun.get("thing2");
      thing2.put({ stuff: "c", more: "ok" });
      gun.get("things").set(thing2, resolve);
    });

    const results = await graphqlGun(
      gql`{
        things(type: Set) {
          stuff
        }
      }`,
      gun
    );

    expect(results).toEqual({ things: [{ stuff: "b" }, { stuff: "c" }] });
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

  it("lets you unsubscribe to a subselection", async () => {
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
            once @unlive {
              one
              two @live
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
