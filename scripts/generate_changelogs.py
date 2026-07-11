#!/usr/bin/env python3
"""
Python script to generate and update changelogs.md automatically based on Git logs.
Groups commits by date and creates clickable links to commits if remote origin is GitHub.
"""

import subprocess
import os

def get_repo_url():
    """Extract HTTPS repository URL from git remote origin configuration."""
    try:
        url = subprocess.check_output(["git", "config", "--get", "remote.origin.url"]).decode("utf-8").strip()
        # Convert git@github.com:username/repo.git or https://github.com/username/repo.git
        if url.startswith("git@"):
            # Replace ':' with '/' and replace 'git@' with 'https://'
            url = url.replace(":", "/").replace("git@", "https://")
        
        # Remove trailing .git if present
        if url.endswith(".git"):
            url = url[:-4]
            
        return url
    except Exception:
        return None

def main():
    repo_url = get_repo_url()
    
    # Get git logs: hash|date|message
    try:
        log_output = subprocess.check_output([
            "git", "log", "--pretty=format:%h|%ad|%s", "--date=short"
        ]).decode("utf-8").strip()
    except Exception as e:
        print(f"Error reading git log: {e}")
        return
    
    if not log_output:
        print("No commits found.")
        return
        
    lines = log_output.split("\n")
    
    # Group commits by date
    commits_by_date = {}
    for line in lines:
        parts = line.split("|", 2)
        if len(parts) < 3:
            continue
        commit_hash, date, msg = parts
        msg = msg.strip()
        
        if date not in commits_by_date:
            commits_by_date[date] = []
        commits_by_date[date].append((commit_hash, msg))
        
    # Build markdown content
    md = []
    md.append("# Changelog\n")
    md.append("All notable changes to this project are documented below, grouped by date.\n")
    
    for date in sorted(commits_by_date.keys(), reverse=True):
        md.append(f"## {date}")
        for commit_hash, msg in commits_by_date[date]:
            if repo_url:
                link = f"[{commit_hash}]({repo_url}/commit/{commit_hash})"
            else:
                link = f"`{commit_hash}`"
            md.append(f"- **{link}**: {msg}")
        md.append("") # Empty line after each date group
        
    # Resolve project root path (parent of scripts directory)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    changelog_path = os.path.join(project_root, "changelogs.md")
    
    with open(changelog_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))
        
    print(f"Successfully generated/updated {changelog_path}")

if __name__ == "__main__":
    main()
