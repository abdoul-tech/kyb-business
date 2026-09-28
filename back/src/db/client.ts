import { MongoClient, type Db } from "mongodb";
import { env } from "../config/env.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db) {
    return db;
  }

  client = new MongoClient(env.MONGO_URL);
  await client.connect();
  db = client.db();
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error("MongoDB n'est pas encore connecté.");
  }
  return db;
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
