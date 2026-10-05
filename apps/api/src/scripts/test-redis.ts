import redis from "../lib/redis";

async function main() {
  const result = await redis.ping();

  console.log("Redis:", result);

  await redis.quit();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});