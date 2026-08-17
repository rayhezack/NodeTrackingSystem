import { Module } from '@nestjs/common';
import { QueryLibraryController } from './query-library.controller';
import { QueryLibraryService } from './query-library.service';
import { BitableModule } from '../bitable/bitable.module';

@Module({
  imports: [BitableModule],
  controllers: [QueryLibraryController],
  providers: [QueryLibraryService],
  exports: [QueryLibraryService],
})
export class QueryLibraryModule {}
