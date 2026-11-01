# 04. Flywheel Brake Lab

New tool. Supports unit module 3 (brake). Mockup: `mockups/04-flywheel-brake-lab.html`. Prototype: the lever shoe brake interactive on the unit plan page.

## 1. Purpose

Students model a spinning wheel and a lever-operated shoe brake, predict the stop, then bring in real timing data from slow-motion video and let the tool fit the slowdown. The tool computes the braking torque the data implies, the friction coefficient behind it, and where the energy went.

### Learning targets

Students can:

1. Compute moment of inertia for a disk, a hoop, or a combination.
2. Use lever moments to find the shoe's normal force.
3. Compute braking torque, angular deceleration, stopping time and turns to stop.
4. Compute rotational kinetic energy and an upper limit on temperature rise.
5. Turn frame counts from video into angular speed and deceleration.
6. Back-calculate a friction coefficient from measured data.
7. (Extension) Explain self-energizing and self-locking brake geometry.

## 2. Scope

In version 1: wheel builder, lever brake with pivot offset and rotation direction, constant-torque stop simulation, coast-down (bearing drag) correction, video data import and fitting, energy and heat panel.

Not in version 1: long-shoe (pivoted) brakes with equivalent friction coefficient, band brakes, disc brakes with multiple pads, heat flow over time.

## 3. Model and math

### 3.1 Moment of inertia

- Solid disk about its axis: I = ½ m r². Thin hoop: I = m r² (OpenStax College Physics 2e, 10.3).
- Combined wheel: sum of parts, for example a hub disk plus a rim hoop. Custom I entry is allowed for teachers.

### 3.2 Lever and shoe

Geometry, drawn in the tool and in help:

- Lever pivot O. Hand force P applied perpendicular to the lever at distance l from O.
- Shoe presses on the drum. The normal force N acts along a line through the drum center, at perpendicular distance x from O.
- The friction force F = μN acts along the drum tangent at the contact. Its line of action is offset from O by perpendicular distance a (a = 0 when the friction line passes through the pivot).
- Moments about O: N x ∓ F a = P l, with the sign set by rotation direction (IIT Kharagpur NPTEL brakes module 12, lesson 1). Rearranged:
  - Self-energizing direction: N = P l / (x − μ a)
  - Other direction: N = P l / (x + μ a)
- If x − μ a ≤ 0 in the energizing direction, the brake is self-locking: it grabs with no hand force. Show this as a result with the explanation, not as an error. Designers keep geometry short of this point (ExtruDesign, single block brake).
- Short shoe assumption: pressure is treated as uniform and friction acts at the middle of the shoe (ExtruDesign). Help text says this applies to shoes covering a small angle of the drum.
- Braking torque: T_b = μ N r (drum radius r).

### 3.3 Stop simulation

- Optional bearing drag torque T_d, entered directly or from a coast-down fit (3.4).
- Total retarding torque T = T_b + T_d. Angular deceleration α = T / I (Newton's second law for rotation, OpenStax 10.3).
- From initial speed ω₀ = 2πN₀/60: stopping time t = ω₀ / α. Angle θ = ω₀² / (2α). Turns = θ / 2π.
- Energy: KE = ½ I ω₀² (OpenStax 10.4). Work done by the brake T_b θ equals the share of KE it removes (OpenStax University Physics 10.8).
- Animate the wheel at true speed (with a slow-motion option at ¼ and 1/10) and show elapsed time.

### 3.4 Data import and fitting

Accepted formats (paste or CSV upload):

1. Frame counts: frames per second of the video, then rows of (frame number, cumulative turns of a marker on the wheel). Time t = frame / fps. Angle θ = 2π × turns.
2. Time and turns: rows of (t in s, cumulative turns).
3. Time per turn: a list of the times for each successive full turn.

Fit θ(t) = θ₀ + ω₀ t + ½ α t² by least squares (quadratic regression) over a student-selected time window. Report ω₀, α and R². Plot the data points, the fitted curve, and the derived ω(t) line.

- Brake torque from data: T_b,meas = I (|α_brake| − |α_coast|), where α_coast comes from a separate coast-down run with the brake off (or 0 if none).
- Friction from data: μ_meas = T_b,meas / (N r), using N from the lever model.
- Compare predicted and measured stopping time, T_b and μ.

### 3.5 Energy and heat

- Upper limit on temperature rise of a chosen part: ΔT ≤ KE / (m_part c), assuming all of the energy goes into that part (OpenStax 14.2). Help text says the real rise is lower because energy also goes into the pad, the air and sound.
- Specific heat: user-entered. Presets: iron or steel 452 J/(kg·°C) (OpenStax 14.2, Table 14.1). Others are teacher-entered placeholders.
- Energy bar: kinetic energy draining into "brake heat" and "bearing drag" as the wheel stops, split by T_b : T_d.

## 4. Inputs and controls

| Input | Symbol | Unit | Range | Default |
|---|---|---|---|---|
| Wheel type | | | Disk, Hoop, Disk + hoop, Custom I | Disk |
| Mass (each part) | m | kg | 0.01 to 200 | 8 |
| Radius (each part) | r | mm | 5 to 1000 | 150 |
| Custom I | I | kg·m² | 0.00001 to 100 | |
| Starting speed | N₀ | rpm | 1 to 3000 | 300 |
| Hand force | P | N | 0 to 1000 | 20 |
| Lever arm to hand | l | mm | 10 to 2000 | 300 |
| Pivot to normal line | x | mm | 5 to 1000 | 100 |
| Pivot offset from friction line | a | mm | −500 to 500 | 0 |
| Rotation direction | | | Energizing, Other | Energizing |
| Friction | μ | | 0.01 to 1.5 | 0.35 |
| Bearing drag | T_d | N·m | 0 to 100 | 0 |
| Heated part mass, specific heat | m_part, c | kg, J/(kg·°C) | | 8, 452 |

Note: with l = 300 mm and x = 100 mm the default lever ratio is 3, matching the unit page's prototype.

## 5. Interactions

1. Build the wheel, set the brake, press Spin up. The wheel spins at N₀.
2. Press Apply brake (or hold B). The wheel slows at the model's α. Readouts update live. The pad color deepens with energy absorbed.
3. Flip rotation direction with a pivot offset and compare stopping times.
4. Data tab: paste or upload data, choose the time window by dragging on the plot, see the fit.
5. Coast-down: mark a data set as "brake off" to get α_coast.
6. Compare panel: predicted versus measured for t, T_b and μ, with percent differences, written to the prediction log.

## 6. Outputs

- I, N, F, T_b, α, t, turns, KE, ΔT upper limit
- Self-energizing factor x/(x − μa) when a ≠ 0, and self-locking warning
- Fit: ω₀, α, R², residual plot
- Measured T_b and μ, and comparison table
- Predict first targets: N, T_b, stopping time, turns to stop, ΔT upper limit

## 7. Test cases

| ID | Inputs | Expected |
|---|---|---|
| FB-1 | Disk m = 8 kg, r = 150 mm, 300 rpm. P = 20 N, l = 300 mm, x = 100 mm, a = 0, μ = 0.35 | I = 0.0900 kg·m². N = 60.0 N. T_b = 3.15 N·m. t = 0.898 s. Turns = 2.24. KE = 44.4 J. ΔT (8 kg steel) ≤ 0.0123 °C |
| FB-2 | FB-1 with hoop instead of disk | I = 0.180 kg·m². t = 1.80 s. Turns = 4.49. KE = 88.8 J |
| FB-3 | FB-1 with a = 20 mm, energizing | N = 64.5 N |
| FB-4 | FB-3, other direction | N = 56.1 N |
| FB-5 | x = 100 mm, a = 300 mm, μ = 0.35, energizing | x − μa = −5 mm. Self-locking result shown with explanation. No N value |
| FB-6 | Data, frame-count format, 240 fps. Frames and turns: 0 → 0; 120 → 2.3011; 240 → 4.2042; 360 → 5.7095; 480 → 6.8169; 600 → 7.5264; 720 → 7.8380 | Fit ω₀ = 31.4 rad/s (300 rpm), α = −10.0 rad/s², R² = 1.000 within rounding |
| FB-7 | FB-6 data with I = 0.09 kg·m², no coast data, N = 60 N, r = 150 mm | T_b,meas = 0.900 N·m. μ_meas = 0.100 |
| FB-8 | FB-7 plus coast-down data giving α_coast = −0.5 rad/s² | T_b,meas = 0.855 N·m |
| FB-9 | Heat: KE = 3000 J into 1 kg steel | ΔT ≤ 6.64 °C |
| FB-10 | Data with fewer than 3 points | Message: "Add at least three data points to fit a curve." |
| FB-11 | fps missing in frame-count format | Field message asking for frames per second |
| FB-12 | P = 0 | N = 0, wheel coasts only on T_d. With T_d = 0, message "no braking torque: the wheel keeps spinning" and no infinite time |

## 8. Acceptance criteria

- [ ] All test cases pass in Node and in the interface.
- [ ] The animated stop time matches the computed t within one animation frame at 1× speed.
- [ ] The fit plot shows data, curve and residuals, and the selected time window is visible and adjustable by keyboard.
- [ ] Show the working covers lever moments with the sign choice explained, T_b, I, α, t, KE, ΔT, and for data mode the fitted coefficients and how α becomes T_b and μ.
- [ ] The help panel includes a one-page student guide to measuring frame counts from phone slow-motion video.

## 9. Sources

- OpenStax College Physics 2e (10.3 rotational inertia, via book home): https://openstax.org/books/college-physics-2e/pages/1-introduction-to-science-and-the-realm-of-physics-physical-quantities-and-units
- OpenStax College Physics 2e, 10.4 Rotational kinetic energy: https://openstax.org/books/college-physics-2e/pages/10-4-rotational-kinetic-energy-work-and-energy-revisited
- OpenStax University Physics Vol. 1, 10.8: https://openstax.org/books/university-physics-volume-1/pages/10-8-work-and-power-for-rotational-motion
- OpenStax College Physics 2e, 14.2 (Q = mcΔT, Table 14.1): https://openstax.org/books/college-physics-2e/pages/14-2-temperature-change-and-heat-capacity
- IIT Kharagpur NPTEL, Design of brakes, module 12 lesson 1 (hosted copy): https://www.pcepurnia.org/wp-content/uploads/2020/03/mod12les1.pdf
- ExtruDesign, single block brake: https://extrudesign.com/single-block-brake-pivoted-block-brake/
