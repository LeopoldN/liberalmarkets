const res = await fetch("/tape.json", { cache: "no-store" });
const data = await res.json();
// data.items -> [{sym,name,date,close,deltaPct,...}]