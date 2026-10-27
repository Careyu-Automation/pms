# CareYu Automation Project Hub — End-to-End Demo Report

Demo record: `DEMO-E2E-4WAY-SHUTTLE-001`  
Customer: Demo Customer Industries  
Project: Demo 4-Way Shuttle Automation (`PRJ-2026-0001`)  
Work date used for the daily update and the email preview: 2026-10-26 (Asia/Kolkata)

The workflow was executed through the application services against the configured PostgreSQL database. Browser click-through, theme checks, Gantt view controls, and screenshots were not run because no browser tools were available in this session.

## 1. End-to-End Workflow

The path that was executed:

Lead creation
→ PM review (changes requested, hold, then accept)
→ Team assignment (Software and Robotics)
→ Feasibility study
→ Feasibility decision: Feasible
→ Solution & Costing
→ Costing approval
→ Quotation prepared, sent, and accepted
→ Project creation
→ Project planning (phase, milestone, task)
→ Task assignment
→ My Assigned Work
→ Daily Work Updates
→ Email Reports preview and download
→ Email send attempted

Quotation is a required step in the current application. A project is created only after the costing is approved and the quotation is accepted. A repeated convert returns the existing project instead of creating another one.

Procurement, Execution, and Vision were not assigned on this demo. Feasible with Conditions, Not Feasible, and More Information Required were not executed on a second study. A rejected lead was not created. Not Feasible is not allowed to open Solution & Costing by the existing gate.

Final stored lead status: `CONVERTED`, stage `Project Execution`.

## 2. Test Results

| Test ID | Module | Test Scenario | Expected Result | Actual Result | Status | Fix Applied |
|---|---|---|---|---|---|---|
| L1 | Lead Pipeline | Create a draft lead | Lead is stored as a draft | LEAD-002 was created and is still the only demo lead | PASS | Lead view now accepts inserts |
| L2 | Lead Pipeline | Reload the draft | Saved fields remain | Title DEMO-E2E-4WAY-SHUTTLE-001 reloads | PASS | |
| L3 | Lead Pipeline | Edit the draft | The list shows the edited requirement | Edit was saved while the lead was a draft; later reruns left it unchanged because it had moved on | PASS | |
| L4 | Lead Pipeline | Repeated save does not duplicate the lead | One lead with the demo title | One lead with this title | PASS | |
| L5 | Lead Pipeline | Submit the lead to the project manager | Status becomes submitted | Submit was accepted while the lead was a draft; the lead then left draft | PASS | Notification view now accepts inserts |
| L6 | Lead Pipeline | A second submit is rejected | The lead is not duplicated or resubmitted | A second submit was rejected with a conflict once the lead had left draft | PASS | |
| P1 | PM Review | Request changes with a reason | Creator can see the reason | Activity stores “Add the shuttle aisle count before approval.” | PASS | |
| P2 | PM Review | Creator updates and resubmits | The lead returns to PM review | The lead was updated and returned to review before approval | PASS | |
| P3 | PM Review | Put the lead on hold, then accept it | Accepted lead is ready for team assignment | Activity stores the hold and the approval | PASS | |
| P4 | PM Review | Reject a lead | Rejection reason is stored | Not executed; no second lead was created | NOT TESTED | |
| T1 | Team Assignment | Assign Software and Robotics | Assignments are stored once | ROBOTICS, SOFTWARE | PASS | |
| T2 | Team Assignment | Accept the assigned teams | Feasibility opens without a duplicate study | 1 study | PASS | |
| F1 | Feasibility | Open the study carried from the lead | Customer and requirement are present | Study 9224b115-3608-4206-9c08-21c3f04aff11 includes Demo Customer Industries | PASS | |
| F2 | Feasibility | Record team assessments, a POC, a risk, and a feasible decision | Study can be submitted | 2 completed team assessments | PASS | Team codes are matched case-insensitively; an empty submit no longer clears the study |
| F3 | Feasibility | Submit and approve the study | Approved decision stays feasible | FEASIBLE | PASS | |
| F4 | Feasibility | Feasible with Conditions, Not Feasible, and More Information Required | Each outcome stores its reason and next step | Not executed on this study | NOT TESTED | |
| C1 | Solution & Costing | Open costing from the feasible study | One costing is linked to the study | Costing e4facddb-8ab6-4bc5-af65-88254b117929 | PASS | |
| C2 | Solution & Costing | BOM line totals and margin | 2 × 10000 plus 3 × 5000 equals 35000; 10% margin is added on internal cost | Material 35000; margin 3500; selling 38500 | PASS | |
| C3 | Solution & Costing | Reject a negative BOM quantity | Negative quantity is not saved | Rejected: BOM quantity and unit cost cannot be negative | PASS | Validation added |
| C4 | Solution & Costing | Submit and approve costing | Version becomes approved | APPROVED | PASS | Costing audit table added |
| Q1 | Quotation | Prepare, send, and accept a demo quotation | Lead is won | Accepted quotation is stored on the lead | PASS | Quotation and negotiation views now write through to the lead |
| PR1 | Project handoff | Convert the approved costing once | A repeated convert does not create another project | PRJ-2026-0001, linked to the lead and costing | PASS | Projects from approved costings are stored in the project registry and still share an id with tasks of the same name |
| G1 | Project Planning | Open the demo project plan | The project name and customer are stored | PRJ-2026-0001, Demo Customer Industries | PASS | |
| G2 | Project Planning | Add a demo phase | The phase remains after the plan is reloaded | Demo engineering phase reloads | PASS | Phases are stored in a table instead of an empty view |
| G3 | Project Planning | Add a demo milestone | The milestone remains after the plan is reloaded | Demo design freeze | PASS | |
| G4 | Task assignment | Assign a demo task to the employee account | The task is linked to this project and that user id | Task 5f037877-75f1-4428-aa35-40613b268315 is assigned to the employee user id | PASS | |
| G5 | Task assignment | Update task status and progress | The reloaded plan keeps the new values | IN_PROGRESS 40% | PASS | |
| G6 | My Assigned Work | The assigned employee sees the task | The task is in that account and not in another account | Assignee only | PASS | |
| G7 | Management access | An existing admin account can open the project | The current role can read the plan | Admin can read the plan; no extra role was granted | PASS | |
| U2 | Project Planning | Day, week, and month Gantt views, Today, and Fit to Screen | The timeline stays readable and the project stays selected | Page was not opened | NOT TESTED | |
| W1 | Daily Work Updates | Save a demo update for the assigned task | The row is stored for the selected date | Update 99a34d4b-1d97-450e-a662-c388e9565f13, 3 hours, In Progress | PASS | |
| W2 | Daily Work Updates | Edit the demo update | The new description is stored | Description update persisted | PASS | |
| W3 | Daily Work Updates | Delete a second demo row only | The report row remains | Temporary row deleted; report row remains | PASS | |
| U3 | Daily Work Updates | Horizontal scroll, column alignment, and a narrow viewport | Every column, including Actions, can be reached | Page was not opened | NOT TESTED | |
| E1 | Email Reports | Preview the report for the demo work date | The preview contains the saved update | 1 record on 2026-10-26, subject uses the CareYu Automation daily report heading | PASS | |
| E2 | Email Reports | Download Excel and PDF | Both files contain the saved update | Both generated files contain the demo work title | PASS | |
| E3 | Email Reports | Send a test report to the signed-in internal account | The provider result is recorded without a false success | Email is not configured. An administrator needs to save the SMTP settings. | BLOCKED | A failed send is returned as an error |
| E4 | Email Reports | Email history records the attempt | A failed send is not stored as sent | FAILED for 2026-10-26 | PASS | |
| D1 | Data integrity | Existing leads remain | No previously stored lead is removed | 9 leads remain, including the demo lead | PASS | |
| D2 | Data integrity | Existing feasibility and costing records remain | Counts do not fall | Studies stayed at 6; costings stayed at 2 | PASS | |
| U1 | Browser | Open each workflow page and click through the demo | Pages render and actions persist | Page was not opened | NOT TESTED | |
| U4 | Theme | Light and dark theme on the demo pages | Both themes remain usable | Page was not opened | NOT TESTED | |
| U5 | Evidence | Screenshots of the completed demo | Screenshots stored without personal data or secrets | No screenshots were captured | NOT TESTED | |

Counts from the last run: 35 PASS, 1 BLOCKED, 5 NOT TESTED in the machine results file, plus the three additional NOT TESTED rows in this report (P4, F4, and the Gantt view row already listed as U2).

## 3. Data Integrity

These demo records are linked in the database:

| Record | Identifier | Link |
|---|---|---|
| Lead | LEAD-002 / DEMO-E2E-4WAY-SHUTTLE-001 | Status CONVERTED, stage Project Execution |
| PM review | Lead activity | Change request, hold, and approval are stored |
| Team assignments | Software, Robotics | Stored on the lead; one feasibility study |
| Feasibility study | 9224b115-3608-4206-9c08-21c3f04aff11 | Decision FEASIBLE, linked to the lead |
| Solution & Costing | e4facddb-8ab6-4bc5-af65-88254b117929 | Linked to that study; version APPROVED |
| Quotation | Stored on the same lead | Accepted, which is what project conversion checks |
| Project | PRJ-2026-0001 | lead, feasibility, and costing ids are set |
| Phase and milestone | Demo engineering / Demo design freeze | Linked to the project |
| Task | 5f037877-75f1-4428-aa35-40613b268315 | Same project id and the assigned employee user id |
| Daily work update | 99a34d4b-1d97-450e-a662-c388e9565f13 | Same project, 2026-10-26, 3 hours |
| Email report | Preview, Excel, PDF, and history | The same saved update; history status FAILED |

Existing leads, feasibility studies, and costings were not removed. Counts did not fall during the last run. No production table was truncated or dropped.

Margin is a markup on total internal cost. With material 35000 and no overhead, contingency, or tax, a 10 percent margin is 3500 and the selling price is 38500.

## 4. Email Verification

| Check | Result |
|---|---|
| Preview generation | PASS. One saved daily work row for 2026-10-26. The preview includes the CareYu Automation heading, the work title, and the summary. |
| Download generation | PASS. Excel and PDF contain the same work title as the preview. |
| Test email delivery | BLOCKED. The provider was not called successfully. SMTP host, sender, and password are not saved. |
| Actual report delivery | BLOCKED. No message was delivered. The test send used the signed-in internal account, not a customer address. |
| Email History persistence | PASS. The attempt is stored as FAILED for 2026-10-26. It is not stored as sent. |

A successful preview is not a delivered email.

## 5. Remaining Issues

- Email cannot be delivered until an administrator saves the SMTP host, sender address, and password in Email Reports settings. The values are not invented here.
- The on-screen Gantt controls, daily-work horizontal scrolling, light and dark themes, and responsive layout were not clicked through.
- Screenshots were not captured.
- Reject, Feasible with Conditions, Not Feasible, and More Information Required were not run on a separate record.
- Procurement, Execution, and Vision were not assigned for this demo.
- The latest change-request text lives in lead activity. Later review notes replace the single note field on the lead.

## 6. Demo Readiness

READY WITH KNOWN LIMITATIONS

The demo lead, feasibility study, approved costing, project, task, and daily work update are stored and linked. The email preview and downloads use that saved update. Email delivery is blocked until SMTP is configured, and the pages were not exercised in a browser.

## 7. Evidence

Machine-readable results: `test-results/e2e-demo-results.json`  
This report: `test-results/e2e-demo-report.md`

No screenshots. No credentials, connection strings, or recipient addresses are included.
