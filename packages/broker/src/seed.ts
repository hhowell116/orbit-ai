// Seed script: creates test users and projects for local development
// Run with: bun run src/seed.ts

import { db } from "./db";

const users = [
  { id: "user-1", username: "hayden", display_name: "Hayden Howell", password: "admin123" },
  { id: "user-2", username: "alice", display_name: "Alice Smith", password: "admin123" },
  { id: "user-3", username: "bob", display_name: "Bob Johnson", password: "admin123" },
];

const projects = [
  { id: "proj-crm", name: "CRM", path: "/projects/crm", opencode_port: 4096, description: "Customer Relationship Management system" },
  { id: "proj-helpdesk", name: "Helpdesk", path: "/projects/helpdesk", opencode_port: 4097, description: "IT Help Desk ticketing system" },
  { id: "proj-infra", name: "Infrastructure", path: "/projects/infrastructure", opencode_port: 4098, description: "Infrastructure automation and monitoring" },
];

async function seed() {
  console.log("Seeding database...");

  for (const user of users) {
    const hash = await Bun.password.hash(user.password, { algorithm: "bcrypt", cost: 12 });
    db.run(
      "INSERT OR REPLACE INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)",
      [user.id, user.username, user.display_name, hash]
    );
    console.log(`  Created user: ${user.username}`);
  }

  for (const project of projects) {
    db.run(
      "INSERT OR REPLACE INTO projects (id, name, path, opencode_port, description) VALUES (?, ?, ?, ?, ?)",
      [project.id, project.name, project.path, project.opencode_port, project.description]
    );
    console.log(`  Created project: ${project.name}`);
  }

  console.log("Done!");
}

seed();
