type Shape = "car" | "suv" | "van" | "pickup" | "truck";

// Decorative silhouettes only; never used for vehicle records or financial calculations.
function silhouette(model: string): Shape {
  const name = model
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i");
  if (/\b(actros|atego|axor|canter|daily kamyon|kamyon|truck)\b/.test(name))
    return "truck";
  if (
    /\b(hilux|ranger|amarok|navara|d[ -]?max|l200|pickup|pick-up)\b/.test(name)
  )
    return "pickup";
  if (
    /\b(transit|sprinter|caddy|berlingo|kangoo|partner|doblo|ducato|crafter|vito|trafic|master|jumper|boxer|van|minibus)\b/.test(
      name,
    )
  )
    return "van";
  if (
    /\b(qashqai|tucson|sportage|duster|tiguan|kuga|rav4|cr-v|suv)\b/.test(name)
  )
    return "suv";
  return "car";
}

const bodies: Record<Shape, string> = {
  car: "M10 45 18 36 37 33 52 18Q56 15 62 15H89Q95 15 99 20L114 35 137 40Q143 41 144 48V57H10Z",
  suv: "M10 43 20 32 37 30 47 13H94Q100 13 104 20L115 32 137 37Q144 39 144 47V57H10Z",
  van: "M10 21Q10 12 19 12H103Q109 12 113 20L128 39 138 42Q144 44 144 49V57H10Z",
  pickup: "M10 32H66L75 16Q78 13 84 13H104L119 36 138 41Q144 43 144 48V57H10Z",
  truck: "M10 9H94V35H100V20Q100 16 105 16H122L136 35 144 40V57H10Z",
};
const windows: Record<Shape, string> = {
  car: "M46 32 57 20H70V32ZM75 20H88Q91 20 94 23L104 32H75Z",
  suv: "M44 29 51 18H70V29ZM75 18H93L101 29H75Z",
  van: "M23 20H62V33H23ZM68 20H94V33H68ZM101 20H107L120 38H101Z",
  pickup: "M73 32 82 18H91V32ZM96 18H102L112 32H96Z",
  truck: "M105 22H119L129 35H105Z",
};

export function VehicleIllustration({ model }: { model: string }) {
  const shape = silhouette(model);
  const front = shape === "truck" ? 124 : 119;
  return (
    <svg
      className="vehicle-illustration"
      viewBox="0 0 154 74"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-shape={shape}
    >
      <path
        d="M7 66H147"
        stroke="#e3e9e6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d={bodies[shape]}
        fill="#e4ebe7"
        stroke="#657b70"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d={windows[shape]} fill="#b5c9bf" />
      {shape === "truck" ? (
        <path
          d="M94 12V53M17 15H87M17 22H87"
          stroke="#a7b9b0"
          strokeWidth="2"
        />
      ) : (
        <path
          d="M72 36V53M80 38H85"
          stroke="#a0b2a8"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {shape === "pickup" && (
        <path d="M17 37H63V48H17" stroke="#a0b2a8" strokeWidth="2" />
      )}
      <path
        d="M12 49H19M135 45H141"
        stroke="#f7f9f8"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M13 56H142" stroke="#657b70" strokeWidth="2" />
      {[34, front].map((x) => (
        <g key={x}>
          <circle cx={x} cy="56" r="11" fill="#fff" />
          <circle cx={x} cy="56" r="9" fill="#46554e" />
          <circle cx={x} cy="56" r="4" fill="#c5d1ca" />
        </g>
      ))}
    </svg>
  );
}
