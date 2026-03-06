const { createClient } = require("@supabase/supabase-js");

const express = require("express");
const axios = require("axios");
const cron = require("node-cron")

const app = express();
app.use(express.json());

const pLimit = require("p-limit");
const limit = pLimit(5);  // max 5 concurrent requests

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function updateAllProjectMetadata() {
  console.log("Fetching profiles with projects...");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select(`
      id,
      github_username,
      projects (
        id,
        repo_url
      )
    `);

  if (error) {
    console.error("Supabase fetch error:", error);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  const updateTasks = [];

  for (const profile of profiles) {
    if (!profile.projects) continue;

    for (const project of profile.projects) {
      if (!project.repo_url) continue;

      updateTasks.push(
        limit(async () => {
          try {
            // Extract owner/repo from URL
            const match = project.repo_url.match(
              /github\.com\/([^/]+)\/([^/]+)/
            );

            if (!match) {
              console.log("Invalid GitHub URL:", project.repo_url);
              return;
            }

            const owner = match[1];
            const repo = match[2].replace(".git", "");

            const res = await axios.get(
              `https://api.github.com/repos/${owner}/${repo}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                },
              }
            );

            await supabase
              .from("projects")
              .update({
                stars: res.data.stargazers_count,
                forks: res.data.forks_count,
                open_issues: res.data.open_issues_count,
                repo_updated_at: res.data.updated_at,
                synced_at: new Date(),
              })
              .eq("id", project.id);

            console.log(`Updated ${owner}/${repo}`);
          } catch (err) {
            console.error(
              `GitHub fetch failed for ${project.repo_url}:`,
              err.response?.status || err.message
            );
          }
        })
      );
    }
  }

  await Promise.all(updateTasks);

  console.log("All project metadata synced.");
}

app.listen(3000, () => {
  console.log("App running on port 3000");
});

cron.schedule("0 */6 * * *", async () => {
  await updateAllProjectMetadata();
});

// Optional: run immediately on startup
updateAllProjectMetadata();