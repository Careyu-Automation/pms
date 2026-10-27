# CareYu Project Hub workflow recording

Recorded from the running application at http://localhost:5176 in a 1920×1080 browser. The recording types into the real forms, clicks the real buttons, and shows the saved records. It is not a slide video.

Demo lead: Automated Component Inspection System, Demo Manufacturing Pvt Ltd.
Project created from that lead: PRJ-2026-0002.

## Videos

Folder: `test-results/demo-videos`

| File | Length |
| --- | --- |
| CareYu_Project_Hub_Complete_Workflow_Demo.mp4 | 3:07 |
| 01_Lead_Creation_and_PM_Review.mp4 | 1:05 |
| 02_Team_Assignment_and_Feasibility.mp4 | 0:42 |
| 03_Solution_Costing_and_Project_Handover.mp4 | 0:47 |
| 04_Task_Assignment_and_Daily_Work.mp4 | 0:27 |
| 05_Email_Reports.mp4 | 0:08 |

All files are 1920×1080. On-screen captions name each stage. The recording moves quickly; pause it where you want to read a form.

## Workflow result

| Step | Result |
| --- | --- |
| Login and dashboard | Pass |
| Required-field validation | Pass |
| Create, reload, and edit the inspection lead | Pass |
| Lead appears in the pipeline and on the detail page | Pass |
| Submit the lead to the project manager | Pass |
| Separate leads for hold and change request | Pass |
| Project manager holds one lead, requests changes on another, and approves the main lead | Pass |
| Assign Vision, Robotics, Software, Procurement, and Execution | Pass |
| Accept the assignments and open the linked feasibility study | Pass |
| Feasibility inputs, team assessments, validation note, risk, and Feasible decision | Pass |
| Solution costing, BOM, margin, review, and approval | Pass |
| Quotation accepted inside the application and converted to PRJ-2026-0002 | Pass |
| Gantt task assigned to an employee | Pass |
| My Assigned Work, Team Tasks, and Daily Work Updates | Pass |
| Email report preview and download | Pass |
| Email delivery | Blocked |

## What was fixed before the recording

- A project manager could accept a team assignment in the API, but the Accept button was hidden after approval. The button is now shown while the assignment is still pending and the project manager can assign teams.
- Accepting a team stored the team code in uppercase. The feasibility study matches lowercase codes, so the assigned team did not appear. The code saved on the study is now lowercase.
- A dropped database connection could stop the API process. That failure is now logged and the API keeps running.

## Differences from the requested sample

- The lead form has no “Industrial Customer” type. The recording uses End customer.
- The five teams use their directory names: Vision Team, Robotics & Automation Solution Team, Software Team, Procurement / Costing Team, and Execution Team.
- “Send” on a quotation changes its status inside CareYu. It does not email the customer.
- The employee can preview and download the Daily Work Report. Send Test Email is disabled for that account, and SMTP is not configured, so no email was sent and no success message was shown.
- Active Projects is the team hub. The converted project is listed under Projects and opens as PRJ-2026-0002.

Earlier recording attempts left additional demo leads with the same sample names. They were not deleted. Existing customer, lead, feasibility, and costing records were not reset.
