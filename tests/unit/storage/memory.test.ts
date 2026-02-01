import { describe, it, expect } from "vitest";
// TODO: SimpleMemoryStore doesn't exist yet - implement or remove this test
// import { SimpleMemoryStore } from "@world/storage/memory/index.js";

describe.skip("SimpleMemoryStore", () => {
  it("should store and retrieve entries", async () => {
    const store = new SimpleMemoryStore();
    const entry = {
      id: "test-1",
      content: "Test content",
      timestamp: Date.now(),
    };

    await store.set(entry);
    const retrieved = await store.get("test-1");

    expect(retrieved).toEqual(entry);
  });

  it("should return null for non-existent entries", async () => {
    const store = new SimpleMemoryStore();
    const retrieved = await store.get("non-existent");

    expect(retrieved).toBeNull();
  });

  it("should search entries by content", async () => {
    const store = new SimpleMemoryStore();
    
    await store.set({
      id: "1",
      content: "Hello world",
      timestamp: Date.now(),
    });
    
    await store.set({
      id: "2",
      content: "Goodbye world",
      timestamp: Date.now(),
    });

    const results = await store.search("world");
    expect(results.length).toBe(2);
    
    const helloResults = await store.search("Hello");
    expect(helloResults.length).toBe(1);
    expect(helloResults[0].id).toBe("1");
  });

  it("should respect search limit", async () => {
    const store = new SimpleMemoryStore();
    
    for (let i = 0; i < 10; i++) {
      await store.set({
        id: `entry-${i}`,
        content: `Content ${i}`,
        timestamp: Date.now(),
      });
    }

    const results = await store.search("Content", 5);
    expect(results.length).toBe(5);
  });

  it("should delete entries", async () => {
    const store = new SimpleMemoryStore();
    const entry = {
      id: "delete-test",
      content: "To be deleted",
      timestamp: Date.now(),
    };

    await store.set(entry);
    const deleted = await store.delete("delete-test");
    
    expect(deleted).toBe(true);
    
    const retrieved = await store.get("delete-test");
    expect(retrieved).toBeNull();
  });
});
