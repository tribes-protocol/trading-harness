#!/usr/bin/env node

import { ANALYSTS } from '@/common/Analysts'
import { runAnalystCli } from '@/helpers/AnalystCli'

runAnalystCli(ANALYSTS.walletAnalyst)
