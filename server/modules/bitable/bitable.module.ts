import { Module } from '@nestjs/common';
import { BitableService } from './bitable.service';

@Module({
  providers: [BitableService],
  exports: [BitableService],
})
export class BitableModule {}
