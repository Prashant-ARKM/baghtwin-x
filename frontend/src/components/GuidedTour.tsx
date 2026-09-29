"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon, { type IconName } from "@/components/Icon";

const steps: { title: string; text: string; tip: string; icon: IconName; route?: string; target?: string }[] = [
  { title: "Meet your well intelligence workspace.", text: "This short walkthrough takes you through the actual screens, from understanding the well to reviewing a recommendation. All values are synthetic simulations.", tip: "Use Next and Back to explore. Skip or press Escape at any time. You can restart from “Take a tour” in the top bar.", icon: "well" },
  { title: "Make room for the work.", text: "Use the sidebar to move between monitoring, planning and validation. The button beside Workspace collapses it to an icon rail, giving charts more space.", tip: "Hover over an icon to see its name. Your sidebar preference is remembered on this browser.", icon: "overview", target: ".sidebar-toggle" },
  { title: "Start with the well overview.", text: "Read the current production, temperature, pump fillage and rod-float risk. The schematic connects those readings to the well, and the recommendation panel shows the proposed next setting.", tip: "Scroll down for no-action versus recommended trends. Expand the well console for alarms and the dynamometer card.", icon: "overview", route: "/", target: ".page-heading" },
  { title: "Explore the well through time.", text: "Choose a cycle, then move the Cycle day slider. The well state, rod-load card and trend markers update together. Use Show sensor data to compare with synthetic measurements.", tip: "Watch temperature fall as viscosity rises. This is the connection between steam treatment and pump performance.", icon: "well", route: "/well-twin", target: 'input[aria-label="Cycle day"]' },
  { title: "Understand the warning.", text: "Compare the alert day, predicted float day and warning lead time. The charts show failure probabilities, rod margin and pump fillage against their limits.", tip: "Move the Day slider or select an event to read the twin’s explanation for that point in the cycle.", icon: "risk", route: "/risk", target: ".page-heading" },
  { title: "Build a recommendation.", text: "Choose Pump schedule only or Steam + pump. Adjust the priority weights and decision day, then select Generate recommendation to run the simulation.", tip: "Compare the proposed settings and outcomes. If you change the inputs, regenerate the plan before making a decision.", icon: "optimizer", route: "/optimizer", target: 'button[aria-pressed]' },
  { title: "Review before you decide.", text: "After generating a plan, open its engineering receipt. Review the current state, no-action forecast, constraints, confidence and alternatives. Enter a reason before choosing Approve or Reject.", tip: "The walkthrough does not generate plans or record decisions for you. Approval only records a simulated decision; it never controls a well.", icon: "audit", route: "/optimizer", target: ".page-heading" },
  { title: "Replay the evidence.", text: "Cycle replay compares the model prediction with synthetic actuals. Inspect the uncertainty band and error metrics, then compare the baseline with the recommended outcome.", tip: "Look for the held-out cycle indicator when evaluating how the twin performs on data outside calibration.", icon: "replay", route: "/replay", target: ".page-heading" },
  { title: "Know the model’s limits.", text: "Model credibility explains what is modelled, estimated or assumed. Review calibration, detector performance and constraint tests before interpreting a recommendation.", tip: "Synthetic test results show consistency of the method, not verified performance at Baghewala.", icon: "credibility", route: "/credibility", target: ".page-heading" },
  { title: "Keep every decision traceable.", text: "Decision audit stores approvals and rejections with their reason and full receipt. Refresh the list to see newly recorded decisions and inspect the evidence behind them.", tip: "You’re ready. Start with Overview, explore the risk, then build and review a plan in Optimizer. This tour is always available in the top bar.", icon: "audit", route: "/audit", target: ".page-heading" },
];

type Bounds = { top: number; left: number; width: number; height: number };

export default function GuidedTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const step = steps[index];

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    nextButton.current?.focus();
    setBounds(null);
    if (step.route && pathname !== step.route) {
      router.push(step.route, { scroll: true });
      return;
    }
    if (!step.target) return;
    let scrolled = false;
    function measure() {
      const target = document.querySelector(step.target!) as HTMLElement | null;
      if (!target) { setBounds(null); return; }
      if (!scrolled) {
        target.scrollIntoView({ block: "center", behavior: "instant" });
        scrolled = true;
      }
      const rect = target.getBoundingClientRect();
      const next = { top: rect.top - 7, left: rect.left - 7, width: rect.width + 14, height: rect.height + 14 };
      setBounds(old => old && Object.keys(next).every(k => old[k as keyof Bounds] === next[k as keyof Bounds]) ? old : next);
    }
    measure();
    const observer = new MutationObserver(measure);
    const workspace = document.getElementById("workspace");
    if (workspace) observer.observe(workspace, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step, pathname, router]);

  return <dialog ref={dialog} className="tour-screen" aria-labelledby="tour-title" aria-describedby="tour-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    {bounds ? <div className="tour-spotlight" style={bounds} aria-hidden="true"/> : <div className="tour-dim" aria-hidden="true"/>}
    <section className={`tour-card ${index === 0 ? "tour-welcome" : ""}`}>
      <div className="tour-card-top"><span className="eyebrow">BaghTwin-X · Guided walkthrough</span><button type="button" onClick={onClose} className="tour-close" aria-label="Close tutorial">×</button></div>
      <div className="tour-step-icon"><Icon name={step.icon}/></div>
      <p className="tour-step-count" aria-live="polite">STEP {index + 1} OF {steps.length}</p>
      <h2 id="tour-title">{step.title}</h2>
      <p id="tour-description">{step.text}</p>
      <div className="tour-tip">{step.tip}</div>
      <div className="tour-progress" role="progressbar" aria-label="Tutorial progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={index + 1}><span style={{ width: `${(index + 1) / steps.length * 100}%` }}/></div>
      <div className="tour-actions"><button type="button" onClick={onClose} className="tour-skip">Skip tour</button><div className="flex gap-2"><button type="button" disabled={index === 0} onClick={() => setIndex(i => i - 1)} className="tour-back">Back</button><button type="button" ref={nextButton} className="primary-button" onClick={() => index === steps.length - 1 ? onClose() : setIndex(i => i + 1)}>{index === 0 ? "Start walkthrough" : index === steps.length - 1 ? "Finish tour" : "Next"}<Icon name="arrow"/></button></div></div>
    </section>
  </dialog>;
}
