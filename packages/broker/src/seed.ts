// Seed script: creates test users, a default team, and projects
// Run with: bun run src/seed.ts

import { db } from "./db";
import { randomBytes } from "crypto";

const users = [
  { id: "user-1", username: "hayden", display_name: "Hayden Howell", password: "admin123", email: "hayden@orbitai.dev" },
  { id: "user-2", username: "alice", display_name: "Alice Smith", password: "admin123", email: "alice@orbitai.dev" },
  { id: "user-3", username: "bob", display_name: "Bob Johnson", password: "admin123", email: "bob@orbitai.dev" },
];

const team = {
  id: "team-default",
  name: "IT Department",
  slug: "it-department",
  owner_id: "user-1",
};

const projects = [
  { id: "proj-crm", name: "CRM", path: "/projects/crm", opencode_port: 4096, description: "Customer Relationship Management system" },
  { id: "proj-helpdesk", name: "Helpdesk", path: "/projects/helpdesk", opencode_port: 4097, description: "IT Help Desk ticketing system" },
  { id: "proj-infra", name: "Infrastructure", path: "/projects/infrastructure", opencode_port: 4098, description: "Infrastructure automation and monitoring" },
];

async function seed() {
  console.log("Seeding database...");

  // Users
  for (const user of users) {
    const hash = await Bun.password.hash(user.password, { algorithm: "bcrypt", cost: 12 });
    db.run(
      "INSERT OR REPLACE INTO users (id, username, display_name, password_hash, email) VALUES (?, ?, ?, ?, ?)",
      [user.id, user.username, user.display_name, hash, user.email]
    );
    console.log(`  Created user: ${user.username}`);
  }

  // Team
  db.run(
    "INSERT OR REPLACE INTO teams (id, name, slug, owner_id) VALUES (?, ?, ?, ?)",
    [team.id, team.name, team.slug, team.owner_id]
  );
  console.log(`  Created team: ${team.name}`);

  // Team members
  const members = [
    { user_id: "user-1", role: "owner" },
    { user_id: "user-2", role: "member" },
    { user_id: "user-3", role: "member" },
  ];
  for (const m of members) {
    db.run(
      "INSERT OR REPLACE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)",
      [team.id, m.user_id, m.role]
    );
  }
  console.log(`  Added ${members.length} members to team`);

  // Invite code
  const code = randomBytes(4).toString("hex").toUpperCase();
  const inviteCode = `${code.slice(0, 4)}-${code.slice(4)}`;
  db.run(
    "INSERT OR IGNORE INTO team_invites (team_id, code, created_by) VALUES (?, ?, ?)",
    [team.id, inviteCode, "user-1"]
  );
  console.log(`  Generated invite code: ${inviteCode}`);

  // Projects (scoped to team)
  for (const project of projects) {
    db.run(
      "INSERT OR REPLACE INTO projects (id, name, path, opencode_port, description, team_id) VALUES (?, ?, ?, ?, ?, ?)",
      [project.id, project.name, project.path, project.opencode_port, project.description, team.id]
    );
    console.log(`  Created project: ${project.name}`);
  }

  // Assign any orphaned projects to the default team
  db.run("UPDATE projects SET team_id = ? WHERE team_id IS NULL", [team.id]);

  console.log("Done!");
}

seed();
