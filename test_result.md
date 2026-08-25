#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Session 2 — New Features (June 2026)
user_problem_statement: |
  Added 4 features + UI fixes on top of stable MVP:
  1. Moonraker (Klipper) as second printer connection type (test-connection via /printer/info, print via /server/files/upload)
  2. Filament price_per_kg + spool_weight_g fields; /api/slice now returns estimated_cost
  3. Model library strip on Workspace tab (switch/delete models)
  4. Bed outline + build volume preview in 3D viewer with EXCEEDS BED warning
  5. Web platform now renders real 3D viewer via iframe (was placeholder box)
  6. Compacted workspace buttons (Move/Scale/Rotate/Snap fit on screen)

backend:
  - task: "Moonraker connection type (test-connection + print)"
    file: "/app/backend/server.py"
    needs_retesting: true
  - task: "Filament pricing fields (price_per_kg, spool_weight_g) CRUD + seed migration"
    file: "/app/backend/server.py"
    needs_retesting: true
  - task: "Slice returns estimated_cost"
    file: "/app/backend/server.py"
    needs_retesting: true

frontend:
  - task: "Model library strip on Workspace (switch + delete)"
    file: "/app/frontend/app/(tabs)/workspace.tsx"
    needs_retesting: true
  - task: "Bed preview + web iframe 3D viewer + compact buttons"
    file: "/app/frontend/app/(tabs)/workspace.tsx"
    needs_retesting: true
  - task: "Printer modal connection type chips (OctoPrint/Moonraker)"
    file: "/app/frontend/app/(tabs)/printers.tsx"
    needs_retesting: true
  - task: "Filament modal price/spool fields + card shows $/kg"
    file: "/app/frontend/app/(tabs)/filaments.tsx"
    needs_retesting: true
  - task: "Slicer shows Cost stat after slicing"
    file: "/app/frontend/app/(tabs)/slicer.tsx"
    needs_retesting: true

agent_communication:
  - agent: "main"
    message: "Session 2 features implemented. Backend smoke-tested: filaments have price_per_kg, slice returns estimated_cost (0.69 for cube). Web viewer verified via screenshot (3D model + bed outline render). Please test all new backend endpoints and frontend flows. No auth. Moonraker/OctoPrint hosts are unreachable in sandbox - test error handling paths only (expect ok:false with message, not crash)."

## Session 2b — Printer Status, Spool Tracker, Auto Arrange, Slice Presets
backend:
  - task: "GET /api/printers/{id}/status (OctoPrint /api/printer, Moonraker /printer/objects/query normalization)"
    needs_retesting: true
  - task: "POST /api/filaments/{id}/usage ($inc grams_used, negative allowed for corrections); grams_used in profile + PATCH reset"
    needs_retesting: true
  - task: "Presets: GET/POST/DELETE /api/presets; seeded Draft/Standard/Fine defaults (delete blocked)"
    needs_retesting: true
  - task: "POST /api/printers/print now accepts filament_profile_id + filament_grams; increments grams_used only on successful send"
    needs_retesting: true
frontend:
  - task: "Printers tab StatusRow: green dot + temps when ok, red dot + Offline when not, refresh icon"
    needs_retesting: true
  - task: "Filaments: spool progress bar (X g left of Y g, LOW warning); Reset spool button in edit modal"
    needs_retesting: true
  - task: "Workspace Arrange button: resets rotation, centers model on bed, lays flat, commits transform to backend"
    needs_retesting: true
  - task: "Slicer: preset chips apply settings, custom preset save via modal + delete X; Log usage button after slicing"
    needs_retesting: true
agent_communication:
  - agent: "main"
    message: "Session 2b implemented. Backend smoke-tested: presets seeded (Draft 0.28/Standard 0.2/Fine 0.12), status returns 'No connection configured' for unconnected printer, usage inc/dec works. Frontend smoke: preset chips render on Slicer. Printer temps will always be Offline in sandbox (unreachable hosts) - only verify graceful UI."
