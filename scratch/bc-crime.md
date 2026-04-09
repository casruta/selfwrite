# British Columbia Crime Analysis (2004-2024)
## Why Canadians think crime is increasing whilst the data shows the opposite to be true

**Caspar Kozłowski** — Mar 25, 2026

British Columbia's Crime Severity Index (CSI) declined 46% from its 1998 peak of 166.9 to 90.2 in 2014, with a further 7.4% year-over-year decrease in 2024, the second-largest provincial drop after Alberta (-8.5%). This analysis examines 20 years of Statistics Canada and BC Government data across five research questions, producing 42 charts and one interactive map.

Key findings: Crime severity fell sharply over two decades, but the composition shifted toward violent offences after 2014. Interior communities register per-capita rates 1.9-2.1x those of coastal cities. Between 2014 and 2019, public perception of rising crime grew from 30% to 42% despite declining aggregate statistics, a gap traceable to five measurement and communication failures.

## Table of Contents

1. Crime Severity Trends
2. Property Crime and Emerging Categories
3. Clearance Rates, Youth Crime, and Policing Costs
4. Geographic Distribution
5. Public Perception vs. Statistical Trends
6. Implications
7. Limitations
8. Methodology
9. Reproducibility

## Key Terms

- **Crime Severity Index (CSI)**: A Statistics Canada measure weighting criminal incidents by the average sentence severity of each offence type (base year: 2006). Higher values indicate more severe crime profiles.
- **Crime rate**: The number of police-reported incidents per 100,000 population, unadjusted for severity.
- **Clearance rate**: The proportion of reported incidents where police identified a suspect, whether or not charges were laid.
- **Unfounded rate**: The proportion of incidents deemed, upon investigation, not to have occurred or not to constitute a criminal offence.
- **Indexed growth (base-100)**: A normalization method that sets a reference year's value to 100, converting subsequent values to percentages of the baseline. A reading of 85 means a 15% decline from the reference year.

## 1. Crime Severity Has Declined, but the Composition Has Shifted

BC's Crime Severity Index fell from a peak of 166.9 in 1998 to 90.2 in 2014, a 46% reduction. A further 7.4% decline followed in 2024, the second-largest year-over-year provincial drop after Alberta (-8.5%). Over the full 1998-2024 series, 18 of 26 year-over-year intervals posted declining rates. Linear regression corroborates the downward trend (p < 0.05).

*[Chart: BC Crime Severity Index: 46% decline from 1998 peak (166.9) to 2014 trough (90.2), continued decline through 2024]*

After 2014, the compositional pattern decoupled from the aggregate trend. Violent crime severity rose while non-violent severity continued to contract. The aggregate index kept falling only because property crime's absolute decline outweighed the upward movement in violent offences. Throughout the 20-year series, BC's CSI remained approximately 21% above the national average.

*[Chart: Violent CSI trending upward since 2014 while non-violent CSI continues to decline]*

No single province drove this pattern. All comparison jurisdictions converged downward when indexed to 2004 = 100. Saskatchewan sustained rates approximately 2.8x Ontario's, but the direction held uniformly. The implication: structural factors (demographic shifts, urbanization, changes in enforcement philosophy) rather than jurisdiction-specific policy account for the decline.

*[Chart: Provincial crime rate comparison: BC consistently above the national average]*

*[Chart: Indexed provincial growth (2004 = 100): all provinces converge downward]*

BC's gap with the national average persisted across the full series.

*[Chart: BC-Canada crime rate gap: persistent across two decades]*

*[Chart: Year-over-year change by province: BC's 7.4% drop ranks second-largest]*

Most of the CSI weight concentrates in a small number of offence types, pinpointing the categories with the greatest leverage for policy intervention.

*[Chart: CSI contribution by violation type: a small number of offences account for most of the index weight]*

BC Government data at the jurisdiction level corroborate the same pattern through 2023.

*[Chart: BC Government year-over-year comparison, 2022-2023]*

**Caveat**: The CSI weights offences by average sentence severity. Criminal Code revisions that reclassify an act to a more serious category increase the index even if the underlying behaviour is unchanged. Post-2019 amendments to domestic violence and sexual assault definitions may account for some of the observed increase in violent crime severity.

## 2. Property Crime Trends and Emerging Offence Categories

Since the early 2000s, property crime declined steadily across all major violation types, constituting 51% of the total crime rate as of 2023. Over five years, the largest absolute changes were:

| Violation | 5-Year Change (per 100,000) |
|---|---|
| Theft from vehicles | -772 |
| Breaking and entering | -270 |
| Theft under $5,000 | -221 |
| Disturb the peace | -165 |

At 772 per 100,000, theft from vehicles posted the largest absolute decrease of any violation type. Shoplifting, by contrast, rose by 79 per 100,000 over the same period.

*[Chart: Crime composition over time: property crime's share contracting as violent crime's share grows]*

*[Chart: Current composition shares: property crime accounts for 51% of total but is declining]*

*[Chart: Violation-level intensity heatmap: property violations cooling while violent types hold steady]*

*[Chart: Largest absolute changes in crime rate: theft from vehicles leads all declines at -772/100k]*

Factors plausibly associated with the vehicle-theft decline include improved vehicle security technology, reduced visibility of valuables, increased contactless payment adoption, and pandemic-era remote work patterns, though the relative contribution of each has not been empirically isolated.

Two violation categories bucked the overall trend. Police-reported child pornography offences rose by 82 per 100,000, and shoplifting by 79 per 100,000. The child exploitation increase aligns with expanded digital investigation capacity (ICAC task forces, automated hash-matching, mandatory platform reporting) rather than a prevalence shift. Shoplifting's rise has multiple candidate explanations: behavioural change, reduced retail security staffing, and changes to prosecution thresholds have each been cited.

*[Chart: Property violation trajectories declining while exploitation and shoplifting trend upward]*

*[Chart: Property crime CAGR is negative; other categories are flat or positive]*

*[Chart: Individual violation trajectories: theft from vehicles declining sharply, shoplifting and exploitation rising]*

*[Chart: Fastest-growing violations: child exploitation and shoplifting lead absolute increases]*

While violent crime's absolute rate remained relatively stable, its share of total crime grew as property offences receded. A chi-squared test confirmed the compositional shift was statistically significant (p < 0.05).

*[Chart: BC Government year-over-year comparison by crime type, 2022-2023]*

## 3. Clearance Rates, Youth Crime, and Policing Costs

Clearance rates split sharply along crime-type lines. Violent crime clearance, historically above 50%, fell to 37.4% by 2024, a 21-percentage-point erosion from its 2014 level. Property crime clearance remained in the 12-16% range throughout the study period: roughly 85% of reported property offences went unresolved across two decades.

*[Chart: Clearance rate trends: violent crime clearance declining from above 50% toward 37%; property crime stable at 12-16%]*

*[Chart: Clearance variation by violation: some types clear above 70% while others remain below 20%]*

Youth crime severity decoupled from the adult trend after 2014. Youth CSI continued to decline while adult CSI stabilized or edged upward.

*[Chart: Youth vs. adult CSI divergence: youth crime continues declining while adult crime stabilizes]*

RCMP detachments and municipal forces followed different trajectories. COVID-19 produced a visible dip in 2020 followed by a partial rebound.

*[Chart: RCMP detachments and municipal forces show different crime trajectories]*

*[Chart: COVID-19 impact: 2020 dip and post-pandemic rebound across crime categories]*

Unfounded rates remained stable, ruling out police reclassification as a driver. The underreporting pattern ran contrary to a reporting-driven decline: property crime, reported at higher rates (~35%), fell more steeply than violent crime (~24% reported).

*[Chart: Unfounded rates stable over time: reclassification did not drive the decline]*

*[Chart: Underreporting proxy analysis: the pattern is inconsistent with a reporting-driven decline]*

### Policing Expenditure Trends

Spending rose as crime fell. Police budgets in BC expanded in both nominal and real (constant 2020 dollar) terms over the study period, with salary and benefits growth outpacing operating and capital expenditure. BC's population rose 10.4% from 5,000,879 in 2018 to 5,519,913 in 2023.

*[Chart: BC policing expenditure: nominal and inflation-adjusted, both rising]*

*[Chart: Per-capita policing cost comparison across provinces]*

*[Chart: CSI vs. expenditure: spending rises while crime severity falls]*

*[Chart: Expenditure breakdown: salaries and benefits outpace operating and capital]*

*[Chart: Police staffing trend: officers per 100,000 population]*

*[Chart: Crimes per officer with CSI overlay: declining crime has not reduced workload]*

## 4. Geographic Distribution of Crime

In absolute terms, Vancouver (~48,812 offences) and Surrey (~41,275) led the province in crime volume. Per-capita rates invert this ranking: interior communities recorded substantially higher figures.

| Community | Rate per 100,000 | Ratio to Vancouver |
|---|---|---|
| Chilliwack | 11,352 | 2.1x |
| Kamloops | 10,546 | 1.9x |
| Vancouver | 5,438 | 1.0x |
| Victoria | 5,283 | 0.97x |

*[Chart: Top 20 jurisdictions by total crime count: Vancouver and Surrey lead in volume]*

*[Chart: The 8 largest jurisdictions follow different trajectories]*

*[Chart: CMA per-capita crime rate: interior communities at approximately 2x the rate of coastal metros]*

*[Chart: Interior CMA rates diverging upward from coastal CMAs over time]*

Underlying the interior-coastal divide lie several associated factors: higher rates of homelessness and visible poverty, acute opioid-crisis exposure, seasonal tourism economies with transient populations, and reliance on RCMP detachments rather than dedicated municipal police services.

*[Chart: Some jurisdictions have disproportionately violent profiles relative to their total crime]*

*[Chart: Crime concentration: a small number of jurisdictions account for most of BC's total]*

*[Chart: Violent crime's share varies widely: some jurisdictions are 3x more violent than others]*

*[Chart: Regional crime rate comparison across BC]*

*[Interactive jurisdiction map (HTML)]*

## 5. Public Perception and Statistical Trends

Between 2014 and 2019, the share of BC residents who reported that crime had increased rose from 30% to 42% (General Social Survey), a 12-percentage-point swing during a period of declining CSI.

| Year | "Crime increased" | "About the same" |
|---|---|---|
| 2009 | 38% | 43% |
| 2014 | 30% | 48% |
| 2019 | 42% | 41% |

*[Chart: Perception vs. reality: 42% of residents believe crime is rising while CSI remains below its peak]*

Five data-traceable factors account for this divergence, each with an identified corrective.

**Factor 1: Compositional Concealment** — The violent component of the CSI increased after 2014 while the non-violent component declined.

**Factor 2: Visibility Bias** — Shoplifting increased by 79 per 100,000 and is directly observable in retail settings. Offsetting declines (772 fewer vehicle thefts and 270 fewer break-ins per 100,000) produce no observable signal.

**Factor 3: Institutional Credibility Erosion** — Property crime clearance remained in the 12-16% range throughout the study period.

**Factor 4: Geographic Averaging** — Chilliwack (11,352/100k) and Kamloops (10,546/100k) posted per-capita rates approximately 2x Vancouver's 5,438.

**Factor 5: Unmeasured Disorder** — Open drug use, encampments, and aggressive panhandling are not Criminal Code offences and do not appear in the CSI.

### Confidence and Reporting Rates

In the 2019 GSS, 30% of BC residents reported "a great deal of confidence" in police, with 47% reporting "some," 17% "not very much," and 5% "none."

*[Chart: Confidence in police by province: BC's figures track the national pattern]*

*[Chart: Reporting rates by crime type: from 6% (sexual assault) to 60% (motor vehicle theft)]*

## Implications

1. Monitor the violent-crime compositional shift.
2. Rebalance resources toward interior communities.
3. Redeploy investigation capacity from property to violent crime.
4. Address the perception-reality gap.
5. Distinguish detection increases from prevalence increases.
