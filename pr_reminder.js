// Script to find all open PRs authored by you that have been approved but not merged
// Prerequisites: Node.js and npm installed
// You'll need to install these dependencies:
// npm install @octokit/graphql dotenv

require('dotenv').config();
const { graphql } = require('@octokit/graphql');

// Create a .env file with your GitHub token
// GITHUB_TOKEN=your_personal_access_token

// Initialize the GraphQL client with your GitHub token
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

// Get the authenticated user (you)
async function getAuthenticatedUser() {
  const { viewer } = await graphqlWithAuth(`
    query {
      viewer {
        login
      }
    }
  `);
  
  return viewer.login;
}

// Get all open PRs authored by you in a specific organization (optional)
async function getOpenPRsByUser(username, organization = null) {
  let query = `is:pr is:open author:${username}`;
  
  // If an organization is specified, limit the search to that organization
  if (organization) {
    query += ` org:${organization}`;
  }
  
  console.log(`Using search query: ${query}`);
  
  const { search } = await graphqlWithAuth(`
    query {
      search(query: "${query}", type: ISSUE, first: 100) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            repository {
              nameWithOwner
              owner {
                login
              }
              name
            }
            createdAt
            updatedAt
          }
        }
      }
    }
  `);

  console.log(`Found ${search.nodes.length} PRs`);
  
  // Filter out any invalid nodes
  return search.nodes.filter(node => node && node.repository);
}

// Check if a PR has been approved but not merged
async function isPRApprovedNotMerged(owner, repo, pull_number) {
  try {
    console.log("Checking PR:", owner, repo, pull_number);
    const { repository } = await graphqlWithAuth(`
      query($owner: String!, $repo: String!, $pull_number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pull_number) {
            merged
            reviews(states: [APPROVED], first: 100) {
              totalCount
              nodes {
                state
                author {
                  login
                }
              }
            }
          }
        }
      }
    `, {
      owner,
      repo,
      pull_number
    });
    
    if (!repository || !repository.pullRequest) {
      console.log(`Unable to fetch PR details for ${owner}/${repo}#${pull_number}`);
      return false;
    }
    
    const pullRequest = repository.pullRequest;
    const hasApproval = pullRequest.reviews.totalCount > 0;
    const isNotMerged = !pullRequest.merged;
    
    return hasApproval && isNotMerged;
  } catch (error) {
    console.error(`Error checking PR ${owner}/${repo}#${pull_number}:`, error.message);
    return false;
  }
}

// Main function
async function findApprovedNotMergedPRs() {
  try {
    // Get organization from env var (optional)
    const organization = process.env.ORGANIZATION;
    
    // Get your username
    const username = await getAuthenticatedUser();
    console.log(`Finding PRs for user: ${username}`);
    
    if (organization) {
      console.log(`Limited to organization: ${organization}`);
    }
    
    // Get all open PRs authored by you
    const openPRs = await getOpenPRsByUser(username, organization);
    
    // Filter to get only approved but not merged PRs
    const results = [];
    
    for (const pr of openPRs) {
      const owner = pr.repository.owner.login;
      const repo = pr.repository.name;
      const pull_number = pr.number;
      
      const isApprovedNotMerged = await isPRApprovedNotMerged(owner, repo, pull_number);
      
      if (isApprovedNotMerged) {
        results.push({
          title: pr.title,
          url: pr.url,
          repository: pr.repository.nameWithOwner,
          created_at: pr.createdAt,
          updated_at: pr.updatedAt
        });
      }
    }
    
    console.log('\nResults:');
    console.log('========');
    
    if (results.length === 0) {
      console.log('No open PRs found that are approved but not merged.');
    } else {
      console.log(`Found ${results.length} approved PRs ready to merge:`);
      
      results.forEach((pr, index) => {
        console.log(`\n${index + 1}. ${pr.title}`);
        console.log(`   Repo: ${pr.repository}`);
        console.log(`   URL: ${pr.url}`);
        console.log(`   Created: ${new Date(pr.created_at).toLocaleString()}`);
        console.log(`   Last updated: ${new Date(pr.updated_at).toLocaleString()}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.status === 401) {
      console.error('Authentication failed. Check your GitHub token.');
    }
  }
}

// Run the script
findApprovedNotMergedPRs();