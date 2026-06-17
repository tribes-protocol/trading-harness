#!/usr/bin/env node

import { ANALYSTS } from '@/common/analysts'
import { runAnalystCli } from '@/helpers/AnalystCli'

runAnalystCli(ANALYSTS.researchAnalyst)
