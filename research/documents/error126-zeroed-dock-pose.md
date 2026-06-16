# Error 126 op .100 (LFIN1231000211) — oorzaak: gezeroede dock-pose (0,0,0)

Datum onderzoek: 2026-06-16. Live bewezen op de maaier via logvergelijking + pgm-occupancy.

## Symptoom
Maaier maait prima, maar aan het einde / bij return-to-home faalt het docken met
error 126 ("Recharging Failed ... check there exists valid path"). Daarna wil hij
niets meer. Gebruiker reed 20x eerder probleemloos terug vanuit dezelfde hoek.

## Oorzaak (definitief)
`auto_recharge` krijgt van `robot_decision` een **charge pose (0,0,0)** in plaats van
de echte dock-pose. De guide-pose (1.25 m vóór het dock) wordt daaruit berekend en
landt daardoor in de **occupied (zwarte) rand van `map.pgm`** in plaats van in het
gazon. De global planner kan geen pad naar een bezet doel plannen -> "goal is
occupied" -> NAV_TO_GUIDE_POSE_FAIL -> error 126.

### Bewijs 1 — auto_recharge logs (werkend vs kapot)
| Datum | charge pose | station_yaw | guide pose | resultaat |
|-------|-------------|-------------|------------|-----------|
| 10 jun | (0.13, -0.52) | 1.58 | (0.13, **-1.77**) -> gazon | OK gedockt |
| 11 jun | (0.13, -0.52) | 1.58 | (0.13, -1.77) | OK |
| **12 jun 15:42 ->** | **(0.00, 0.00)** | **0.00** | (-1.25, 0.00) -> rand | **126** |
| 16 jun | (0.00, 0.00) | 0.00 | (-1.25/-1.70/-1.10) | 126 |

Regressie begon **12 juni**, niet 14 juni. Met yaw 1.58 wijst de guide-pose 1.25 m
naar het zuiden (gazon, vrij). Met de gezeroede (0,0,0) wijst hij naar het westen,
de map-rand in.

### Bewijs 2 — pgm-occupancy (map.yaml: res 0.05, origin [-21.25,-20.70])
```
guide -1.25,0      px(400,29)  OCC (val 0)   window 289/289 bezet
guide -1.70,-0.15  px(391,32)  OCC           289/289 bezet
guide -1.10,0.15   px(403,26)  OCC           288/289 bezet
dock  0.125,-0.517 px(428,39)  FREE (254)    grotendeels vrij
robot -7.58,-12.77 px(273,284) FREE          volledig vrij (open gazon)
```
Alle drie de guide-poses vallen in massief zwart. Het dock zelf en de robotpositie
zijn vrij. `map.pgm` is de native versie (md5 30d0a37...) en is correct — het
probleem is niet de pgm maar de verkeerde (gezeroede) pose die de guide-pose de
rand in stuurt.

## Waarom maaien wel werkt
Maaien gebruikt de dock-pose niet. Alleen het docken berekent een guide-pose uit de
charge-pose. Verder draait maaien in segmentatie-modus (height genegeerd) terwijl
docken detectie-modus gebruikt — maar dat is hier een afleiding: de ~0.32 m
"obstakels" in de local costmap zijn de echte tuinobjecten (plantenpot, kruiwagen,
speeltoestel) rond de in het veld vastgelopen maaier, NIET de blokkade. De blokkade
is puur de gezeroede dock-pose -> guide-pose in de pgm-rand.

## Wie/wat heeft het veroorzaakt
De {0,0,0} zero-fallback bug in de server-side map-regeneratie
(`synthMowerFiles.ts` / `portableBackup.ts createBundleFromDb`). Toen de gebruiker
op 12 juni een **obstacle ge-shrinkt** heeft in het dashboard, regenereerde de
server de maaier-mapbestanden. De server had voor .100 geen opgeslagen dock-pose
(nooit via de server gerecalibreerd), dus de fallback schreef `charging_pose (0,0,0)`
naar `map_info.json`, dat naar de maaier ging. `robot_decision` las dat bij boot in.
Klopt met "ik heb nooit een import gedaan, maar wel een obstacle geshrinkt" en
"het is onze code".

## Waarom herhaald herstellen niet hielp — de ECHTE bron-van-waarheid
De per-map kopieën in `home0/` waren niet de operatieve bron. De actieve bron is:

  `/userdata/lfi/charging_station_file/charging_station.yaml`  (top-level, NIET in maps/home0)

Die stond op `[0, 0, 0]`. Mechanisme, live bevestigd via mtimes:
1. Top-level charging_station.yaml = bron-van-waarheid voor de actieve sessie.
2. Bij ELKE boot kopieert de maaier die pose naar `home0/csv_file/map_info.json`
   (csv_file mtime sprong naar 13:35:47 = exact het boot-moment, en kreeg (0,0,0)
   terwijl ie daarvoor 1.575 was). `x3_csv_file` wordt NIET geregenereerd (bleef 1.575).
3. `robot_decision` leest `csv_file/map_info.json` bij startup -> gebruikt (0,0,0).

Daarom werd elk herstel van home0/map_info.json overschreven: ik herstelde de
afgeleide, niet de bron. Eerdere herstart hielp niet want de top-level stond nog op 0.

## Fix toegepast (live, 2026-06-16, BEWEZEN)
Top-level + csv_file teruggezet op de bekende-goede 1.575 (gesourced uit de intacte
`x3_csv_file/map_info.json`), plus de mirror `/root/novabot/data/charging_station_file/`.
Daarna `systemctl restart novabot_launch.service`. Na herstart bleven alle 3 op 1.575
(boot-regen pakt nu de juiste top-level). Dock daarna succesvol:
`charge pose 0.13,-0.52 yaw 1.58 -> guide 0.13,-1.77 (gazon, vrij 289/289) -> CHARGING`,
`robot_decision recharge action result 4 (SUCCEEDED)`.

## Waarom 1.575 herstellen niet meteen hielp (oorspronkelijke notitie)
`robot_decision` cachet de pose bij boot/startup en herleest niet per request.

## Fix
1. **Direct:** nav/decision-stack herstarten zodat `robot_decision` de herstelde
   charge-pose (1.575) inleest -> guide-pose (0.13,-1.77) -> gazon -> dockbaar.
2. **Permanent:** de {0,0,0}-guard in `synthMowerFiles.ts` + `portableBackup.ts`
   (al geschreven, nog niet gecommit) — gooit nu i.p.v. (0,0,0) te schrijven.
   Commit ongeacht de docktest; deze bug moet hoe dan ook weg.
3. **Shrinked obstacle behouden:** de shrink opnieuw toepassen met de GEFIXTE code
   (die de pose niet meer zeroet).

## NAV/decision herstart-pad (LoRa-bewust)
Nodes zijn kinderen van launch-PID 2933. `auto_recharge` heeft respawn=True.
Volledige soft-restart (`systemctl restart novabot_launch.service`) herstart alles
en herlaadt de pose, maar verbreekt tijdelijk de LoRa/charger-link (herstelt zelf).
