"""Narrated walkthrough of the CareYu demo workflow. No secrets are spoken or drawn."""
import os
import subprocess
import textwrap
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "_walkthrough-build"
OUT = ROOT / "CareYu-workflow-walkthrough.mp4"
W, H = 1920, 1080

NAVY = (8, 30, 64)
BLUE = (3, 86, 197)
BLUE_SOFT = (232, 240, 252)
INK = (16, 32, 51)
MUTED = (84, 98, 118)
LINE = (214, 224, 236)
WHITE = (255, 255, 255)
BG = (244, 247, 252)
GREEN = (15, 122, 72)
GREEN_SOFT = (226, 244, 234)
AMBER = (140, 84, 8)
AMBER_SOFT = (255, 244, 224)
CARD = (255, 255, 255)

STEPS = [
    "Lead",
    "Review",
    "Teams",
    "Feasibility",
    "Costing",
    "Quotation",
    "Project",
    "Plan",
    "Daily work",
    "Email",
]

SCENES = [
    {
        "kicker": "CareYu Automation  ·  Project Hub",
        "title": "How one customer request moves through the hub",
        "voice": "This is the CareYu Automation Project Hub. This video follows one customer request from the first lead, through review, feasibility, costing, and the project plan, until the daily work report.",
        "bullets": [
            "The same demo record is used at every stage.",
            "Each stage stores its own record and keeps the link to the previous one.",
            "Nothing in this path is sample text. The report reads the saved daily work.",
        ],
        "aside": "Demo record  DEMO-E2E-4WAY-SHUTTLE-001",
        "step": None,
    },
    {
        "kicker": "The customer request",
        "title": "Demo Customer Industries needs a 4-way shuttle",
        "voice": "The customer is Demo Customer Industries. They need automated pallet storage and retrieval. The pallet is 1200 by 1000 millimetres, and the payload is 1000 kilograms. The required solution is a 4-way shuttle, with warehouse integration. Priority is high, and the decision date is 15 December 2026.",
        "bullets": [
            "Application: automated pallet storage and retrieval",
            "Pallet 1200 × 1000 mm    ·    Payload 1000 kg",
            "Deliverables: technical solution, feasibility, and costing",
        ],
        "aside": "Customer  Demo Customer Industries",
        "step": 0,
    },
    {
        "kicker": "Who moves the work",
        "title": "Use the accounts you already have",
        "voice": "Four kinds of people move this work, using the accounts already in the directory. The business head creates the lead and later prepares the quotation. The project manager reviews the lead, assigns teams, and approves feasibility and costing. The assigned teams record the feasibility assessment. The employee who receives the task logs the daily work. No extra access is added for the demo.",
        "bullets": [
            "Business head — create the lead, then prepare and accept the quotation",
            "Project manager — review, assign teams, approve feasibility and costing",
            "Assigned teams — Software and Robotics on this demo",
            "Assigned employee — sees the task and logs daily work",
        ],
        "aside": "Open the app at  http://localhost:5176",
        "step": None,
    },
    {
        "kicker": "Step 1  ·  Lead Pipeline",
        "title": "Create the lead and submit it once",
        "voice": "Open Lead Pipeline and choose Create Lead. Enter the customer, the contact, the requirement, the application, the priority, and the decision date. Save the draft, then refresh the browser. The draft is still there, with the same fields. Edit it and save again. The list shows one lead, not two. Submit it to the project manager. A second submit is rejected, so the lead is not duplicated.",
        "bullets": [
            "Menu: Lead Pipeline  →  Create Lead",
            "Saved demo lead: LEAD-002",
            "Refresh keeps the draft. A repeated submit does not create another lead.",
        ],
        "aside": "Status moves from Draft to Submitted",
        "step": 0,
    },
    {
        "kicker": "Step 2  ·  Project manager review",
        "title": "Ask for a change, hold it, then accept it",
        "voice": "Sign in as the project manager and open the submitted lead. Request changes, and write the reason. In this demo the reason is to add the shuttle aisle count. That reason is stored in the lead activity, so the person who created the lead can see it, edit the lead, and submit it again. The project manager can then put the lead on hold, and after that accept it. Acceptance makes the lead ready for team assignment.",
        "bullets": [
            "Request changes — the reason stays in lead activity",
            "Hold — the lead waits, with the reason recorded",
            "Accept — the lead is ready for team assignment",
        ],
        "aside": "A rejected lead was not part of this demo",
        "step": 1,
    },
    {
        "kicker": "Step 3  ·  Team assignment",
        "title": "Assign Software and Robotics once",
        "voice": "After acceptance, the project manager assigns teams. This demo assigns Software and Robotics. Assigning those same teams again does not create a second set of assignments. When the assignment is accepted, the hub opens one feasibility study for the lead. Opening the lead again does not create another study. Procurement, Execution, and Vision are not assigned on this demo.",
        "bullets": [
            "Assigned: Software and Robotics",
            "Not assigned on this demo: Procurement, Execution, Vision",
            "One feasibility study is created for the lead",
        ],
        "aside": "Study id stays the same if you reopen the lead",
        "step": 2,
    },
    {
        "kicker": "Step 4  ·  Feasibility Studies",
        "title": "The study keeps the customer and the requirement",
        "voice": "Open Feasibility Studies and find the demo opportunity. The customer, the application, and the requirement come from the lead. Software and Robotics each record findings, the resources they need, constraints, assumptions, and a timeline. The study also stores a proof of concept, one risk, and one customer input. The decision on this demo is Feasible, so Solution Costing can open. A decision of Not Feasible does not open costing.",
        "bullets": [
            "Menu: Feasibility Studies",
            "Decision on this demo: Feasible",
            "Not Feasible stops the path before costing",
        ],
        "aside": "One study  ·  linked to LEAD-002",
        "step": 3,
    },
    {
        "kicker": "Step 5  ·  Solution Costing",
        "title": "Quantity times unit cost, then margin on the internal cost",
        "voice": "Open Solution Costing from the feasible study. The lead and the feasibility conclusion are already there. Add two demo components. Two units at 10,000 rupees is 20,000. Three units at 5,000 rupees is 15,000. The material total is 35,000 rupees. Margin is a markup on the internal cost. It is not taken off the selling price. Ten percent of 35,000 is 3,500, so the selling price is 38,500. A negative quantity is rejected and is not saved. The costing then goes from draft, to internal review, to submitted for approval, and then to approved. There is still one costing for this study.",
        "bullets": [
            "2 × ₹10,000  +  3 × ₹5,000  =  ₹35,000 material",
            "Margin is 10% of the internal cost  =  ₹3,500",
            "Selling price  =  ₹38,500     ·     Status: Approved",
        ],
        "aside": "Menu: Solution Costing",
        "step": 4,
    },
    {
        "kicker": "Step 6  ·  Quotation",
        "title": "The customer acceptance is required before a project",
        "voice": "A project is not created at the moment costing is approved. The business head prepares a quotation on the lead, sends it, and records that the customer accepted it. That acceptance is stored on the lead. The project conversion checks for it. If the quotation has not been accepted, the hub will not create the project.",
        "bullets": [
            "Who: Business head, on the same lead",
            "Prepare, send, then record the acceptance",
            "The accepted quotation stays linked to LEAD-002",
        ],
        "aside": "This step is required by the current workflow",
        "step": 5,
    },
    {
        "kicker": "Step 7  ·  Active Projects",
        "title": "One project, linked back to the lead and the costing",
        "voice": "Convert the approved costing. The hub creates project P R J 2026 0001, named Demo 4-Way Shuttle Automation, for Demo Customer Industries. The project stores the lead, the feasibility study, and the costing. Convert it again and you get the same project, not a second one. The lead status becomes Converted, and the stage becomes Project Execution. You will find it under Active Projects.",
        "bullets": [
            "Menu: Active Projects",
            "Project: PRJ-2026-0001  ·  Demo 4-Way Shuttle Automation",
            "A repeated convert does not create another project",
        ],
        "aside": "Lead status  CONVERTED",
        "step": 6,
    },
    {
        "kicker": "Step 8  ·  Project Planning and Gantt",
        "title": "Add the phase, the milestone, and the task",
        "voice": "Open Project Planning and Gantt and select Demo 4-Way Shuttle Automation. Add a phase called Demo engineering, and a milestone called Demo design freeze. Add a task called Demo shuttle aisle layout, with a start date and an end date. Assign that task to one employee, on the Software team. Set the status to In Progress and the progress to 40 percent. Refresh the page. The phase, the milestone, and the task are still there.",
        "bullets": [
            "Menu: Project Planning & Gantt  →  select the demo project",
            "Phase: Demo engineering     Milestone: Demo design freeze",
            "Task: Demo shuttle aisle layout  ·  In Progress  ·  40%",
        ],
        "aside": "The task uses the same project id",
        "step": 7,
    },
    {
        "kicker": "Step 9  ·  My Assigned Work, then Daily Work Updates",
        "title": "Only the assigned employee logs the day",
        "voice": "Sign in as the employee who was assigned the task. Open My Assigned Work. The shuttle task is listed. Sign in as a different employee and that task is not in their list. The assigned employee then opens Daily Work Updates and logs 26 October 2026: the title, the description, the project, the status, the priority, the blocker, the next action, 40 percent progress, and 3 hours. Refresh the page and the row is still there. Edit the description and the new text is saved. A second temporary row can be deleted without removing the real update. The summary cards are counted from these saved rows.",
        "bullets": [
            "My Assigned Work shows the task only for the assignee",
            "Daily Work Updates  ·  26 Oct 2026  ·  3 hours  ·  In Progress",
            "The summary is calculated from the saved rows",
        ],
        "aside": "Menu: Daily Work Updates",
        "step": 8,
    },
    {
        "kicker": "Step 10  ·  Email Reports",
        "title": "The preview uses the saved row. The email is not sent yet.",
        "voice": "Open Email Reports. Set the report date to 26 October 2026, the period to the full day, and the type to the daily work report. Choose an internal recipient, never the customer. Preview Report shows the saved shuttle update, the CareYu heading, the summary, the hours, the blocker, and the next action. Download Excel and Download PDF contain that same row. Send is a different result. SMTP is not configured, so the send stops with an error. Email History stores the attempt as failed. It does not show a success message. A preview is not a delivered email.",
        "bullets": [
            "Preview and downloads: the saved update for 26 Oct 2026",
            "Send: blocked until SMTP host, sender, and password are saved",
            "Email History status: Failed",
        ],
        "aside": "Menu: Email Reports",
        "tone": "warn",
        "step": 9,
    },
    {
        "kicker": "What stays connected",
        "title": "One chain, from the lead to the report",
        "voice": "These records stay linked. One lead. One feasibility study. One approved costing. One accepted quotation. One project. One task, assigned to one employee. One daily work update on 26 October 2026. The email preview, the Excel file, the PDF, and the email history all use that same update. The customer name and the project name are the same at every stage.",
        "bullets": [
            "LEAD-002  →  one study  →  one approved costing  →  one quotation",
            "PRJ-2026-0001  →  one task  →  one daily update on 26 Oct 2026",
            "Preview, Excel, PDF, and history describe that same update",
        ],
        "aside": "Existing customer records were not replaced",
        "step": 9,
    },
    {
        "kicker": "What you can show",
        "title": "Walk this record in the app",
        "voice": "To show this to management, sign in with the existing accounts and open the demo record on each page in this order. Lead Pipeline, Feasibility Studies, Solution Costing, Active Projects, Project Planning and Gantt, My Assigned Work, Daily Work Updates, and Email Reports. Say clearly that the report preview and the downloads are ready, and that the email itself will send after an administrator saves the SMTP settings. Do not send the report to a real customer.",
        "bullets": [
            "Show the saved demo record. Do not create a second one.",
            "Preview and downloads are ready for 26 Oct 2026.",
            "Email delivery waits on SMTP settings. Do not email a customer.",
        ],
        "aside": "Ready to demonstrate, with email delivery still to configure",
        "tone": "ok",
        "step": 9,
    },
]


def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(os.path.join(os.environ["WINDIR"], "Fonts", name), size)


def wrap(draw, text, face, width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if draw.textlength(trial, font=face) <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def rounded(draw, box, radius, fill, outline=None):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2 if outline else 0)


def draw_scene(scene, index):
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 92), fill=NAVY)
    draw.text((64, 28), "CareYu Automation", font=font(28, True), fill=WHITE)
    draw.text((430, 32), "Project Hub", font=font(24), fill=(186, 208, 240))
    draw.text((W - 420, 32), "Workflow walkthrough", font=font(22), fill=(186, 208, 240))
    draw.rectangle((0, 92, W, 98), fill=BLUE)

    f_kicker = font(22, True)
    f_title = font(48, True)
    f_body = font(30)
    f_aside = font(24, True)
    y = 140
    draw.text((72, y), scene["kicker"].upper(), font=f_kicker, fill=BLUE)
    y += 48
    title_lines = wrap(draw, scene["title"], f_title, 1700)
    for line in title_lines:
        draw.text((72, y), line, font=f_title, fill=INK)
        y += 62
    y += 18

    tone = scene.get("tone")
    card_fill = AMBER_SOFT if tone == "warn" else GREEN_SOFT if tone == "ok" else WHITE
    card_edge = (232, 196, 140) if tone == "warn" else (170, 214, 186) if tone == "ok" else LINE
    bullets = scene["bullets"]
    card_h = 36 + len(bullets) * 78
    rounded(draw, (64, y, W - 64, y + card_h), 22, card_fill, card_edge)
    by = y + 28
    for bullet in bullets:
        dot = AMBER if tone == "warn" else GREEN if tone == "ok" else BLUE
        draw.ellipse((100, by + 12, 122, by + 34), fill=dot)
        lines = wrap(draw, bullet, f_body, 1580)
        for line in lines:
            draw.text((148, by), line, font=f_body, fill=INK)
            by += 40
        by += 28
    y += card_h + 28

    rounded(draw, (64, y, W - 64, y + 72), 16, BLUE_SOFT)
    draw.text((92, y + 20), scene["aside"], font=f_aside, fill=NAVY)

    # Step trail
    trail_y = 960
    count = len(STEPS)
    gap = 16
    left = 64
    usable = W - 128 - gap * (count - 1)
    pill_w = usable // count
    active = scene["step"]
    f_step = font(18, True)
    for number, label in enumerate(STEPS):
        x = left + number * (pill_w + gap)
        done = active is not None and number < active
        current = active == number
        fill = BLUE if current else (214, 228, 248) if done else (232, 236, 242)
        color = WHITE if current else BLUE if done else MUTED
        rounded(draw, (x, trail_y, x + pill_w, trail_y + 48), 12, fill)
        tw = draw.textlength(label, font=f_step)
        draw.text((x + (pill_w - tw) / 2, trail_y + 12), label, font=f_step, fill=color)

    draw.text((64, 1028), f"{index + 1}  /  {len(SCENES)}", font=font(20), fill=MUTED)
    draw.text((W - 620, 1028), "DEMO-E2E-4WAY-SHUTTLE-001", font=font(20), fill=MUTED)
    return image


def speak(text, wav_path):
    script = BUILD / "speak.ps1"
    source = BUILD / "line.txt"
    source.write_text(text, encoding="utf-8")
    script.write_text(
        textwrap.dedent(
            f"""
            Add-Type -AssemblyName System.Speech
            $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
            $synth.Rate = -1
            $names = @($synth.GetInstalledVoices() | ForEach-Object {{ $_.VoiceInfo.Name }})
            $choice = $names | Where-Object {{ $_ -match 'Zira|Aria|Jenny|Guy|Davis' }} | Select-Object -First 1
            if ($choice) {{ $synth.SelectVoice($choice) }}
            $line = Get-Content -Raw -Encoding UTF8 '{source}'
            $synth.SetOutputToWaveFile('{wav_path}')
            $synth.Speak($line)
            $synth.Dispose()
            """
        ).strip(),
        encoding="utf-8",
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        check=True,
    )


def wav_duration(path):
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / float(handle.getframerate())


def append_silence(path, seconds=0.55):
    with wave.open(str(path), "rb") as handle:
        params = handle.getparams()
        frames = handle.readframes(handle.getnframes())
    extra = b"\x00" * int(params.framerate * seconds) * params.nchannels * params.sampwidth
    with wave.open(str(path), "wb") as handle:
        handle.setparams(params)
        handle.writeframes(frames + extra)


def main():
    BUILD.mkdir(exist_ok=True)
    ffmpeg = os.environ["FFMPEG"]
    parts = []
    for index, scene in enumerate(SCENES):
        png = BUILD / f"slide-{index:02d}.png"
        wav = BUILD / f"voice-{index:02d}.wav"
        clip = BUILD / f"clip-{index:02d}.mp4"
        draw_scene(scene, index).save(png)
        speak(scene["voice"], wav)
        append_silence(wav)
        duration = wav_duration(wav)
        subprocess.run(
            [
                ffmpeg, "-y",
                "-loop", "1", "-t", f"{duration:.3f}", "-i", str(png),
                "-i", str(wav),
                "-vf", "fps=30,format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "160k",
                "-shortest", "-movflags", "+faststart",
                str(clip),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        parts.append(clip)
        print(f"scene {index + 1}/{len(SCENES)} {duration:.1f}s", flush=True)

    listing = BUILD / "clips.txt"
    listing.write_text("".join(f"file '{part.as_posix()}'\n" for part in parts), encoding="utf-8")
    subprocess.run(
        [
            ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
            "-c", "copy", "-movflags", "+faststart", str(OUT),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(OUT)


if __name__ == "__main__":
    main()
