export const DASHBOARDWISE_DONUT_PATHS = [
  "M 60 8 A 52 52 0 1 1 59.99 8",
  "M 60 8 A 52 52 0 0 1 111.1 69.4",
  "M 111.1 69.4 A 52 52 0 0 1 38.8 107.5",
] as const;

export function DashboardwiseDonutFixture() {
  return (
    <>
      <style>
        {`
          @keyframes dashboardwise-donut-enter {
            from {
              opacity: 0;
              transform: scale(0.96);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          .dw-donut-card {
            align-items: center;
            background: rgb(255, 255, 255);
            border: 1px solid rgb(226, 232, 240);
            border-radius: 8px;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
            box-sizing: border-box;
            color: rgb(15, 23, 42);
            display: flex;
            flex-direction: column;
            font-family: Inter, Arial, sans-serif;
            gap: 14px;
            height: 286px;
            justify-content: center;
            padding: 20px;
            width: 360px;
          }

          .dw-donut-card h2 {
            font-size: 15px;
            font-weight: 650;
            line-height: 1.25;
            margin: 0;
          }

          .dw-donut-shell {
            align-items: center;
            display: flex;
            height: 176px;
            justify-content: center;
            width: 176px;
          }

          .dw-donut-svg {
            display: block;
            height: 176px;
            overflow: visible;
            width: 176px;
          }

          .dw-donut-segment {
            animation: dashboardwise-donut-enter 640ms ease-out both;
            fill: none;
            stroke-linecap: round;
            stroke-width: 14;
            transform-origin: 60px 60px;
          }

          .dw-donut-label {
            align-items: center;
            animation: dashboardwise-donut-enter 520ms ease-out both;
            background: rgba(255, 255, 255, 0.94);
            border: 1px solid rgb(226, 232, 240);
            border-radius: 999px;
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
            box-sizing: border-box;
            color: rgb(15, 23, 42);
            display: flex;
            flex-direction: column;
            font-family: Inter, Arial, sans-serif;
            gap: 4px;
            height: 112px;
            justify-content: center;
            letter-spacing: 0.01em;
            line-height: 1.05;
            padding: 10px;
            text-align: center;
            transform: translateZ(0);
            white-space: normal;
            width: 112px;
          }

          .dw-donut-label-title {
            color: rgb(71, 85, 105);
            font-size: 11px;
            font-weight: 650;
            line-height: 1.1;
            margin: 0;
            text-transform: uppercase;
          }

          .dw-donut-label-value {
            color: rgb(15, 23, 42);
            font-size: 22px;
            font-weight: 760;
            line-height: 1;
            margin: 0;
            white-space: nowrap;
          }
        `}
      </style>
      <article className="dw-donut-card" data-testid="dashboardwise-donut-card">
        <h2>Matter Health</h2>
        <div className="dw-donut-shell">
          <svg
            aria-label="Matter health donut chart"
            className="dw-donut-svg"
            data-testid="dashboardwise-donut-svg"
            height="120"
            viewBox="0 0 120 120"
            width="120"
          >
            <path
              className="dw-donut-segment"
              d={DASHBOARDWISE_DONUT_PATHS[0]}
              stroke="rgb(226, 232, 240)"
            />
            <path
              className="dw-donut-segment"
              d={DASHBOARDWISE_DONUT_PATHS[1]}
              stroke="rgb(6, 182, 212)"
              strokeDasharray="118 212"
            />
            <path
              className="dw-donut-segment"
              d={DASHBOARDWISE_DONUT_PATHS[2]}
              stroke="rgb(20, 184, 166)"
              strokeDasharray="84 212"
            />
            <g transform="translate(60 60)">
              <foreignObject height="112" width="112" x="-56" y="-56">
                <div className="dw-donut-label">
                  <p className="dw-donut-label-title">Active Matters</p>
                  <p className="dw-donut-label-value">80.1%</p>
                </div>
              </foreignObject>
            </g>
          </svg>
        </div>
      </article>
    </>
  );
}
